// src/worker.js — сервер clip4k.app (Cloudflare Worker).
// Статический сайт отдаётся из public/ (ASSETS). Здесь только /api/*:
//   GET  /api/status?device=&key=   доступ и сколько осталось пробных видео
//   POST /api/tail                  добавить хвост (по оглавлению файла), с проверкой доступа
//   POST /api/activate              привязать ключ к устройству
//   POST /api/pay                   создать оплату подписки через Finik (новый ключ или продление), вернёт ссылку на страницу оплаты
//   POST /api/finik/webhook         Finik сообщает об оплате → ключ выдаётся/продлевается сам
//   GET  /api/order?id=&token=      статус оплаты и ключ
//   POST /api/tg                    вебхук Telegram-бота (кнопки «Выдать ключ» / «Отклонить»)
//   GET  /api/setup?s=СЕКРЕТ        один раз: подключить вебхук бота
//
// Секреты (Cloudflare → Worker → Settings → Variables and Secrets):
//   TG_BOT_TOKEN   токен бота от @BotFather
//   TG_ADMIN_CHAT  твой chat id (бот сам пришлёт его на /start)
//   TG_SECRET      любая длинная случайная строка (защита вебхука и /api/setup)
//   FINIK_API_KEY, FINIK_PRIVATE_KEY, FINIK_PUBLIC_KEY, FINIK_ACCOUNT_ID — те же, что у diamond.kg (см. src/finik.js)

import { buildHead } from "./tail.js";
import { finikReady, createFinikPayment, readFinikWebhook, PAY_MIN } from "./finik.js";

const TRIALS = 3;            // бесплатных видео на устройство
const MAX_DEVICES = 3;       // устройств на один ключ
const PRICE = 200;           // сом за подписку
const DAYS = 30;             // дней подписки
const DAY = 864e5;
const IP_TRIALS_30D = 6;     // пробных видео с одного IP за 30 дней (чтобы не обходили очисткой браузера)
const MAX_HEAD = 24 << 20;   // ftyp+moov не больше 24 МБ

const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
const now = () => Date.now();
const DEV_RE = /^[0-9a-f]{32}$/;
const KEY_RE = /^C4K-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randStr(n, alphabet = B32) {
  const b = new Uint8Array(n); crypto.getRandomValues(b);
  let s = ""; for (const x of b) s += alphabet[x % alphabet.length]; return s;
}
const newKey = () => `C4K-${randStr(4)}-${randStr(4)}-${randStr(4)}`;
const normKey = k => String(k || "").toUpperCase().replace(/[\s_]+/g, "").replace(/^C4K-?(\w{4})-?(\w{4})-?(\w{4})$/, "C4K-$1-$2-$3");

async function ipHash(req, env) {
  const ip = req.headers.get("cf-connecting-ip") || "0";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode((env.TG_SECRET || "c4k") + ip));
  return [...new Uint8Array(d)].slice(0, 12).map(x => x.toString(16).padStart(2, "0")).join("");
}

// Новые столбцы добавляются сами при первом запросе (старые базы продолжают работать)
let schemaOk = false;
async function ensureSchema(env) {
  if (schemaOk) return;
  const cols = async t => (await env.DB.prepare(`PRAGMA table_info(${t})`).all()).results.map(c => c.name);
  const lc = await cols("licenses"), oc = await cols("orders");
  if (!lc.includes("expires")) await env.DB.prepare("ALTER TABLE licenses ADD COLUMN expires INTEGER").run();   // NULL = навсегда
  for (const [c, type] of [["amount", "REAL"], ["method", "TEXT"], ["pay_url", "TEXT"], ["fee", "REAL"], ["renew_key", "TEXT"]])
    if (!oc.includes(c)) await env.DB.prepare(`ALTER TABLE orders ADD COLUMN ${c} ${type}`).run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS payments (tx_id TEXT PRIMARY KEY, order_id TEXT NOT NULL, amount REAL NOT NULL, created INTEGER NOT NULL)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS hooklog (ts INTEGER NOT NULL, host TEXT, result TEXT, order_id TEXT, amount REAL)").run();   // каждое уведомление Finik — для разбора
  schemaOk = true;
}
const fmtDate = ms => { const d = new Date(ms + 6 * 3600e3); return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`; };   // по Бишкеку

async function getLicense(env, key) {
  if (!KEY_RE.test(key)) return null;
  const r = await env.DB.prepare("SELECT key, devices, revoked, expires FROM licenses WHERE key = ?").bind(key).first();
  if (!r || r.revoked) return null;
  return { key: r.key, devices: JSON.parse(r.devices || "[]"), expires: r.expires || null, expired: !!(r.expires && r.expires < now()) };
}

// Выдать новый ключ на 30 дней или продлить существующий (дни прибавляются к оставшимся)
async function grant(env, { key, device, ref, note }) {
  if (key) {
    const lic = await getLicense(env, key);
    if (lic) {
      if (!lic.expires) return { key, expires: null, lifetime: true, renewed: false };
      const expires = Math.max(now(), lic.expires) + DAYS * DAY;
      await env.DB.prepare("UPDATE licenses SET expires = ? WHERE key = ?").bind(expires, key).run();
      return { key, expires, renewed: true };
    }
  }
  const k = newKey(), expires = now() + DAYS * DAY;
  await env.DB.prepare("INSERT INTO licenses (key, created, order_id, devices, note, expires) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(k, now(), ref || null, JSON.stringify(device ? [device] : []), String(note || "").slice(0, 100), expires).run();
  return { key: k, expires, renewed: false };
}
async function notifyAdmin(env, text) { if (env.TG_ADMIN_CHAT) await tg(env, "sendMessage", { chat_id: String(env.TG_ADMIN_CHAT).trim(), text }); }

// Ключ годится для устройства? При необходимости привязывает новое устройство.
async function licenseFor(env, key, device, bind) {
  const lic = await getLicense(env, key);
  if (!lic) return { ok: false, reason: "badkey" };
  if (lic.expired) return { ok: false, reason: "expired", expires: lic.expires };
  if (lic.devices.includes(device)) return { ok: true, expires: lic.expires };
  if (lic.devices.length >= MAX_DEVICES) return { ok: false, reason: "devices" };
  if (bind) {
    lic.devices.push(device);
    await env.DB.prepare("UPDATE licenses SET devices = ? WHERE key = ?").bind(JSON.stringify(lic.devices), key).run();
  }
  return { ok: true, expires: lic.expires };
}

async function trialsLeft(env, device) {
  const r = await env.DB.prepare("SELECT used FROM trials WHERE device = ?").bind(device).first();
  return Math.max(0, TRIALS - (r ? r.used : 0));
}

async function ipCount(env, ip, kind, sinceMs) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM ipuse WHERE ip = ? AND kind = ? AND ts > ?").bind(ip, kind, now() - sinceMs).first();
  return r ? r.n : 0;
}

// ---------- Telegram ----------
async function tg(env, method, body) {
  if (!env.TG_BOT_TOKEN) return { ok: false, description: "no token" };
  const init = body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const r = await fetch(`${env.TG_API || "https://api.telegram.org"}/bot${String(env.TG_BOT_TOKEN).trim()}/${method}`, init);   // TG_API — только для тестов
  return r.json().catch(() => ({ ok: false }));
}
const STAR_PRICE = 120;                 // ⭐ за 30 дней (≈ 200 сом)
const SUPPORT = "@AktilekKaziev";
const siteKb = { inline_keyboard: [[{ text: "🎬 Открыть clip4k.app", url: "https://clip4k.app" }], [{ text: `⭐ Подписка на ${DAYS} дней за ${STAR_PRICE} звёзд`, callback_data: "buy" }]] };
const WELCOME = `Привет! Это Clip4K 👋

TikTok часто сжимает видео до 576p. Clip4K готовит файл так, чтобы ролик выходил в 2K–4K и до 120 fps.

1. Откройте clip4k.app
2. Загрузите видео и нажмите «Подготовить»
3. Скачайте и публикуйте в TikTok

🎁 3 видео бесплатно
💎 Дальше — подписка ${PRICE} сом на ${DAYS} дней (QR любого банка на сайте) или ${STAR_PRICE} ⭐ прямо здесь: /buy
🔁 Продлить ключ звёздами: /renew КЛЮЧ`;
const INV_TITLE = `Clip4K — подписка на ${DAYS} дней`;
const INV_DESC = `Безлимитная подготовка видео для TikTok в 2K/4K до 120 fps на ${DAYS} дней, до ${MAX_DEVICES} устройств. Ключ придёт сразу после оплаты.`;
const isAdmin = (env, chatId) => env.TG_ADMIN_CHAT && String(chatId) === String(env.TG_ADMIN_CHAT).trim();

async function handleTg(req, env) {
  if (!env.TG_SECRET || req.headers.get("x-telegram-bot-api-secret-token") !== String(env.TG_SECRET).trim()) return new Response("forbidden", { status: 403 });
  const u = await req.json().catch(() => ({}));
  if (u.callback_query) {
    const q = u.callback_query, chat = q.message && q.message.chat && q.message.chat.id;
    if (q.data === "buy") {
      await tg(env, "answerCallbackQuery", { callback_query_id: q.id });
      await tg(env, "sendInvoice", { chat_id: chat, title: INV_TITLE, description: INV_DESC, payload: "lic", currency: "XTR", prices: [{ label: INV_TITLE, amount: STAR_PRICE }] });
      return json({ ok: true });
    }
    if (!isAdmin(env, chat)) { await tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: "Нет доступа" }); return json({ ok: true }); }
    const [act, id] = String(q.data || "").split(":");
    const o = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id || "").first();
    if (!o) { await tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: "Заказ не найден" }); return json({ ok: true }); }
    let note;
    if (o.status !== "pending") note = o.status === "approved" ? `Уже выдан: ${o.license_key}` : "Уже отклонён";
    else if (act === "ok") {
      const key = newKey();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO licenses (key, created, order_id, devices, note) VALUES (?, ?, ?, '[]', ?)").bind(key, now(), id, o.contact || ""),
        env.DB.prepare("UPDATE orders SET status = 'approved', license_key = ? WHERE id = ?").bind(key, id),
      ]);
      note = `✅ Выдан ключ ${key}`;
    } else if (act === "no") {
      await env.DB.prepare("UPDATE orders SET status = 'rejected' WHERE id = ?").bind(id).run();
      note = "❌ Отклонено";
    }
    await tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: note || "" });
    if (note && q.message) {
      const cap = (q.message.caption || q.message.text || "") + "\n\n" + note;
      const m = { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } };
      if (q.message.photo || q.message.document) await tg(env, "editMessageCaption", { ...m, caption: cap });
      else await tg(env, "editMessageText", { ...m, text: cap });
    }
    return json({ ok: true });
  }
  // Оплата звёздами: Telegram спрашивает «можно ли принять платёж» — отвечаем за 10 секунд
  if (u.pre_checkout_query) {
    const q = u.pre_checkout_query, okPayload = /^(lic|topup|ren)$/.test(String(q.invoice_payload || "").split(":")[0]);
    await tg(env, "answerPreCheckoutQuery", okPayload ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: "Счёт устарел, нажмите /buy ещё раз" });
    return json({ ok: true });
  }
  const msg = u.message;
  if (msg && msg.successful_payment) {
    const sp = msg.successful_payment, chat = msg.chat.id, who = msg.from ? (msg.from.username ? "@" + msg.from.username : msg.from.first_name || "") : "";
    const [kind, rkey] = String(sp.invoice_payload || "").split(":"), charge = "tg:" + sp.telegram_payment_charge_id;
    if (kind === "lic" || kind === "ren") {
      await ensureSchema(env);
      // Telegram может прислать одно и то же событие повторно — выдаём/продлеваем только один раз
      const ins = await env.DB.prepare("INSERT OR IGNORE INTO payments (tx_id, order_id, amount, created) VALUES (?, ?, ?, ?)").bind(charge, "stars", sp.total_amount, now()).run();
      if (ins.meta.changes) {
        const g = await grant(env, { key: kind === "ren" ? normKey(rkey) : null, ref: charge, note: `stars ${sp.total_amount} ${who}` });
        const till = g.expires ? `до ${fmtDate(g.expires)}` : "навсегда";
        await tg(env, "sendMessage", { chat_id: chat, text: `✅ Оплата получена, спасибо!\n\n${g.renewed ? "Подписка продлена" : "Ваш ключ"}: ${g.key}\nДействует ${till}.\n\nОткройте clip4k.app → «У меня уже есть ключ» → вставьте ключ. До ${MAX_DEVICES} устройств.\nПродлить: /renew ${g.key}`, reply_markup: siteKb });
        await notifyAdmin(env, `⭐ ${g.renewed ? "Продление" : "Подписка"} за звёзды: ${sp.total_amount} ⭐ от ${who}\nКлюч ${g.key}, ${till}`);
      }
    } else {
      await tg(env, "sendMessage", { chat_id: chat, text: `⭐ Получено ${sp.total_amount} звёзд. Спасибо!` });
      if (env.TG_ADMIN_CHAT) await tg(env, "sendMessage", { chat_id: String(env.TG_ADMIN_CHAT).trim(), text: `⭐ Пополнение баланса бота: ${sp.total_amount} ⭐ от ${who}` });
    }
    return json({ ok: true });
  }
  if (msg && msg.text) {
    const chat = msg.chat.id, t = msg.text.trim();
    const reply = text => tg(env, "sendMessage", { chat_id: chat, text });
    const invoice = (payload, title, description, amount) => tg(env, "sendInvoice", { chat_id: chat, title, description, payload, currency: "XTR", prices: [{ label: title, amount }] });
    if (/^\/id\b/.test(t) || (/^\/start\b/.test(t) && (isAdmin(env, chat) || !env.TG_ADMIN_CHAT)))
      await reply(`Ваш chat id: ${chat}\nВпишите его в секрет TG_ADMIN_CHAT, чтобы получать чеки.` + (isAdmin(env, chat) ? "\n\nВы администратор. Команды: /newkey [заметка], /stats, /revoke КЛЮЧ, /topup ЧИСЛО" : ""));
    else if (/^\/start\b/.test(t))
      await tg(env, "sendMessage", { chat_id: chat, text: WELCOME, reply_markup: siteKb });
    else if (/^\/buy\b/.test(t))
      await invoice("lic", INV_TITLE, INV_DESC, STAR_PRICE);
    else if (/^\/renew\b/.test(t)) {
      await ensureSchema(env);
      const key = normKey(t.replace(/^\/renew\s*/, "")), lic = await getLicense(env, key);
      if (!lic) await reply("Напишите ключ после команды, например:\n/renew C4K-XXXX-XXXX-XXXX");
      else if (!lic.expires) await reply("Этот ключ действует навсегда, продлевать не нужно 🙂");
      else await invoice("ren:" + key, `Продление ${key} на ${DAYS} дней`, `Сейчас ключ действует до ${fmtDate(lic.expires)}. После оплаты прибавится ${DAYS} дней.`, STAR_PRICE);
    }
    else if (/^\/topup\b/.test(t)) {
      // пополнить баланс бота звёздами (например, чтобы оплатить рекламу). Может оплатить любой аккаунт.
      const n = Math.floor(Number(t.replace(/^\/topup\s*/, "")) || 0);
      if (n < 1 || n > 100000) await reply("Напишите количество звёзд, например: /topup 100");
      else await invoice("topup", "Пополнение баланса Clip4K", `Перевод ${n} звёзд на баланс бота @clip4k_pay_bot.`, n);
    } else if (/^\/(paysupport|help)\b/.test(t))
      await reply(`Вопросы по оплате и ключам: ${SUPPORT}\nЕсли ключ не пришёл — напишите, приложив дату оплаты.`);
    else if (isAdmin(env, chat) && /^\/newkey\b/.test(t)) {
      // /newkey заметка — навсегда (например, блогерам); /newkey 30 заметка — на 30 дней
      await ensureSchema(env);
      const args = t.replace(/^\/newkey\s*/, ""), m = args.match(/^(\d{1,4})\s*(.*)$/);
      const days = m ? +m[1] : 0, note = ((m ? m[2] : args) || "вручную").slice(0, 100), key = newKey(), exp = days ? now() + days * DAY : null;
      await env.DB.prepare("INSERT INTO licenses (key, created, devices, note, expires) VALUES (?, ?, '[]', ?, ?)").bind(key, now(), note, exp).run();
      await reply(`Новый ключ: ${key}\n${exp ? "Действует до " + fmtDate(exp) : "Навсегда"}`);
    } else if (isAdmin(env, chat) && /^\/stats\b/.test(t)) {
      await ensureSchema(env);
      const n = now(), m30 = n - 30 * DAY;
      const a = await env.DB.prepare(`SELECT
        (SELECT COUNT(*) FROM licenses WHERE revoked = 0 AND expires > ?) AS subs,
        (SELECT COUNT(*) FROM licenses WHERE revoked = 0 AND expires IS NULL) AS forever,
        (SELECT COUNT(*) FROM orders WHERE method = 'finik' AND status = 'approved' AND created > ?) AS paid30,
        (SELECT COALESCE(SUM(amount - COALESCE(fee, 0)), 0) FROM orders WHERE method = 'finik' AND status = 'approved' AND created > ?) AS net30,
        (SELECT COUNT(*) FROM orders WHERE method = 'finik' AND status = 'approved') AS paidAll,
        (SELECT COALESCE(SUM(amount - COALESCE(fee, 0)), 0) FROM orders WHERE method = 'finik' AND status = 'approved') AS netAll,
        (SELECT COUNT(*) FROM trials) AS trialdev`).bind(n, m30, m30).first();
      await reply(`Активных подписок: ${a.subs}\nКлючей навсегда: ${a.forever}\n\nОплат Finik за 30 дней: ${a.paid30} (на счёт ≈ ${Math.round(a.net30)} сом после 2%)\nВсего оплат Finik: ${a.paidAll} (≈ ${Math.round(a.netAll)} сом)\n\nУстройств с пробными: ${a.trialdev}`);
    } else if (isAdmin(env, chat) && /^\/revoke\b/.test(t)) {
      const key = normKey(t.replace(/^\/revoke\s*/, ""));
      const r = await env.DB.prepare("UPDATE licenses SET revoked = 1 WHERE key = ?").bind(key).run();
      await reply(r.meta.changes ? `Ключ ${key} отключён` : "Ключ не найден");
    }
  }
  return json({ ok: true });
}

// ---------- API ----------
async function api(req, env, url) {
  const p = url.pathname;
  await ensureSchema(env);

  if (p === "/api/status" && req.method === "GET") {
    const device = url.searchParams.get("device") || "", key = normKey(url.searchParams.get("key"));
    if (!DEV_RE.test(device)) return json({ error: "device" }, 400);
    const lic = key ? await licenseFor(env, key, device, false) : { ok: false };
    return json({ licensed: lic.ok, expires: lic.expires || null, keyError: key && !lic.ok ? lic.reason : undefined, trialsLeft: await trialsLeft(env, device), trials: TRIALS, price: PRICE, days: DAYS, pay: finikReady(env), stars: STAR_PRICE });
  }

  if (p === "/api/activate" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const device = String(b.device || ""), key = normKey(b.key);
    if (!DEV_RE.test(device)) return json({ error: "device" }, 400);
    const r = await licenseFor(env, key, device, true);
    return r.ok ? json({ ok: true, key, expires: r.expires || null }) : json({ error: r.reason, expires: r.expires || null }, r.reason === "devices" ? 409 : r.reason === "expired" ? 402 : 404);
  }

  if (p === "/api/tail" && req.method === "POST") {
    const device = req.headers.get("x-device") || "", key = normKey(req.headers.get("x-key"));
    if (!DEV_RE.test(device)) return json({ error: "device" }, 400);
    let meta; try { meta = JSON.parse(req.headers.get("x-meta") || "{}"); } catch { return json({ error: "meta" }, 400); }
    const { ftypLen, mdatPos, mdatSize, layout, pad } = meta;
    if (![ftypLen, mdatPos, mdatSize].every(Number.isSafeInteger)) return json({ error: "meta" }, 400);
    const len = +req.headers.get("content-length") || 0;
    if (len > MAX_HEAD) return json({ error: "big" }, 413);

    // доступ: ключ или пробные видео
    let licensed = false, ip;
    if (key) {
      const r = await licenseFor(env, key, device, true);
      if (!r.ok) return json({ error: r.reason }, r.reason === "devices" ? 409 : r.reason === "expired" ? 402 : 403);
      licensed = true;
    } else {
      if (await trialsLeft(env, device) <= 0) return json({ error: "pay", price: PRICE }, 402);
      ip = await ipHash(req, env);
      if (await ipCount(env, ip, "trial", 30 * 864e5) >= IP_TRIALS_30D) return json({ error: "pay", price: PRICE }, 402);
    }

    const body = new Uint8Array(await req.arrayBuffer());
    if (body.length > MAX_HEAD || ftypLen > body.length) return json({ error: "big" }, 413);
    let head;
    try {
      head = buildHead({ ftyp: body.subarray(0, ftypLen), moov: body.subarray(ftypLen), mdatPos, mdatSize, layout: layout === "chunk" ? "chunk" : "audio", pad });
    } catch (e) { return json({ error: "file", detail: String(e.message || e).slice(0, 120) }, 422); }

    let left = null;
    if (!licensed) {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO trials (device, used, ip, last) VALUES (?, 1, ?, ?) ON CONFLICT(device) DO UPDATE SET used = used + 1, ip = excluded.ip, last = excluded.last").bind(device, ip, now()),
        env.DB.prepare("INSERT INTO ipuse (ip, ts, kind) VALUES (?, ?, 'trial')").bind(ip, now()),
      ]);
      left = await trialsLeft(env, device);
    }
    return new Response(head.moov, { headers: { "content-type": "application/octet-stream", "cache-control": "no-store", "x-layout": head.layout, "x-pad": String(head.pad), "x-licensed": licensed ? "1" : "0", "x-trials-left": left === null ? "" : String(left) } });
  }

  // Оплата подписки через Finik: новый ключ (key пустой) или продление своего ключа
  if (p === "/api/pay" && req.method === "POST") {
    if (!finikReady(env)) return json({ error: "notready" }, 503);
    const b = await req.json().catch(() => ({}));
    const device = String(b.device || ""), key = b.key ? normKey(b.key) : "";
    if (!DEV_RE.test(device)) return json({ error: "device" }, 400);
    let renew = null;
    if (key) {
      const lic = await getLicense(env, key);
      if (!lic) return json({ error: "badkey" }, 404);
      if (!lic.expires) return json({ error: "lifetime" }, 409);
      renew = key;
    }
    const ip = await ipHash(req, env);
    if (await ipCount(env, ip, "pay", 3600e3) >= 10) return json({ error: "often" }, 429);
    const id = "C4" + randStr(10), token = randStr(24);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO orders (id, token, created, status, device, ip, amount, method, renew_key) VALUES (?, ?, ?, 'pending', ?, ?, ?, 'finik', ?)").bind(id, token, now(), device, ip, PRICE, renew),
      env.DB.prepare("INSERT INTO ipuse (ip, ts, kind) VALUES (?, ?, 'pay')").bind(ip, now()),
    ]);
    const r = await createFinikPayment(env, { id, amount: PRICE, description: `Clip4K — ${renew ? "продление" : "подписка"} на ${DAYS} дней` },
      `${url.origin}/?paid=${id}&t=${token}#buy`, `${String(env.FINIK_WEBHOOK_BASE || url.origin).replace(/\/+$/, "")}/api/finik/webhook`);
    if (r.error) {
      await env.DB.prepare("UPDATE orders SET status = 'failed' WHERE id = ?").bind(id).run();
      console.error("finik create", r.error);
      return json({ error: "finik", detail: r.error }, 502);
    }
    await env.DB.prepare("UPDATE orders SET pay_url = ? WHERE id = ?").bind(r.url, id).run();
    return json({ id, token, url: r.url });
  }

  // Finik присылает подписанное уведомление после оплаты
  if (p === "/api/finik/webhook" && req.method === "POST") {
    if (!env.FINIK_PUBLIC_KEY) return new Response("off", { status: 503 });
    const host = url.host;
    const log = (result, id = null, amount = null) => env.DB.prepare("INSERT INTO hooklog (ts, host, result, order_id, amount) VALUES (?, ?, ?, ?, ?)").bind(now(), host, result, id, amount).run().catch(() => {});
    const w = await readFinikWebhook(env, req);
    if (w.bad) {
      console.log("finik webhook:", w.bad); await log("bad " + w.bad);
      await notifyAdmin(env, `⚠️ Clip4K: пришло уведомление Finik, но оно не прошло проверку (${w.bad}, ${host}). Если клиент оплатил — выдайте ключ вручную: /newkey 30 заметка`);
      return new Response("bad " + w.bad, { status: w.bad === "json" ? 400 : 401 });
    }
    const body = w.body, st = String(body.status || "").toLowerCase();
    const f = body.fields || {}, id = String(f.paymentId || "").slice(0, 20), tx = String(body.transactionId || body.id || ""), paid = Number(body.amount) || 0;
    await log(st || "no status", id, paid);
    if (!["success", "succeeded"].includes(st)) return new Response("ignored");
    if (!id || !tx) return new Response("no ids");
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO payments (tx_id, order_id, amount, created) VALUES (?, ?, ?, ?)").bind(tx, id, paid, now()).run();
    if (!ins.meta.changes) return new Response("duplicate");
    const o = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first();
    if (!o) { await notifyAdmin(env, `⚠️ Clip4K/Finik: оплата ${paid} сом по неизвестному заказу ${id} (транзакция ${tx}). Проверьте в кабинете Finik.`); return new Response("ok"); }
    if (paid + 0.001 < (o.amount || PRICE)) { await notifyAdmin(env, `⚠️ Clip4K/Finik: заказ ${id} оплачен не полностью: ${paid} из ${o.amount} сом. Ключ НЕ выдан.`); return new Response("ok"); }
    if (o.status === "approved") return new Response("ok");
    const g = await grant(env, { key: o.renew_key, device: o.device, ref: id, note: "finik " + id });
    const fee = Math.round(paid * Number(env.FINIK_FEE_PCT || 0.02) * 100) / 100;
    await env.DB.prepare("UPDATE orders SET status = 'approved', license_key = ?, fee = ? WHERE id = ?").bind(g.key, fee, id).run();
    await notifyAdmin(env, `💳 Clip4K: оплата ${paid} сом (Finik)\n${g.renewed ? "🔁 Продление" : "🆕 Новая подписка"}: ${g.key}\nДействует ${g.expires ? "до " + fmtDate(g.expires) : "навсегда"}\nКомиссия ≈ ${fee} сом`);
    return new Response("ok");
  }

  if (p === "/api/order" && req.method === "GET") {
    const o = await env.DB.prepare("SELECT status, token, license_key, created, method FROM orders WHERE id = ?").bind(url.searchParams.get("id") || "").first();
    if (!o || o.token !== url.searchParams.get("token")) return json({ error: "notfound" }, 404);
    let status = o.status, expires = null;
    if (status === "pending" && o.method === "finik" && o.created < now() - (PAY_MIN + 5) * 60e3) status = "expired";
    if (status === "approved" && o.license_key) { const l = await getLicense(env, o.license_key); expires = l ? l.expires : null; }
    return json({ status, key: status === "approved" ? o.license_key : undefined, expires });
  }

  if (p === "/api/tg" && req.method === "POST") return handleTg(req, env);

  if (p === "/api/setup" && req.method === "GET") {
    if (!env.TG_SECRET || url.searchParams.get("s") !== String(env.TG_SECRET).trim())
      // подсказка без значений: какие секреты сайт видит
      return json({ error: "forbidden", TG_SECRET: env.TG_SECRET ? "есть, но не совпадает со ссылкой" : "НЕТ", TG_BOT_TOKEN: env.TG_BOT_TOKEN ? "есть" : "НЕТ", TG_ADMIN_CHAT: env.TG_ADMIN_CHAT ? "есть" : "НЕТ" }, 403);
    const hook = await tg(env, "setWebhook", { url: `${url.origin}/api/tg`, secret_token: String(env.TG_SECRET).trim(), allowed_updates: ["message", "callback_query", "pre_checkout_query"] });
    const pub = [{ command: "start", description: "Что такое Clip4K" }, { command: "buy", description: `Подписка на ${DAYS} дней за ${STAR_PRICE} ⭐` }, { command: "renew", description: "Продлить ключ звёздами" }, { command: "paysupport", description: "Помощь с оплатой" }];
    const cmds = await tg(env, "setMyCommands", { commands: pub });
    if (env.TG_ADMIN_CHAT) await tg(env, "setMyCommands", { scope: { type: "chat", chat_id: Number(String(env.TG_ADMIN_CHAT).trim()) }, commands: [...pub, { command: "id", description: "Показать chat id" }, { command: "newkey", description: "Ключ вручную: /newkey [дни] заметка" }, { command: "stats", description: "Статистика" }, { command: "revoke", description: "Отключить ключ" }, { command: "topup", description: "Пополнить баланс бота звёздами" }] });
    await tg(env, "setMyDescription", { description: `Clip4K: видео в TikTok в 2K–4K и до 120 fps, а не 576p. 3 видео бесплатно, дальше ${PRICE} сом в месяц.` });
    await tg(env, "setMyShortDescription", { short_description: "TikTok в 4K 120 fps вместо 576p · clip4k.app" });
    return json({ webhook: hook, commands: cmds, adminChat: env.TG_ADMIN_CHAT ? "задан" : "НЕ задан — напишите боту /start и впишите chat id в TG_ADMIN_CHAT" });
  }

  return json({ error: "notfound" }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(req, env, url); }
      catch (e) { console.error(e); return json({ error: "server" }, 500); }
    }
    return env.ASSETS.fetch(req);
  },
};
