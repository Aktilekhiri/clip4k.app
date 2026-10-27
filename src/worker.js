// src/worker.js — сервер clip4k.app (Cloudflare Worker).
// Статический сайт отдаётся из public/ (ASSETS). Здесь только /api/*:
//   GET  /api/status?device=&key=   доступ и сколько осталось пробных видео
//   POST /api/tail                  добавить хвост (по оглавлению файла), с проверкой доступа
//   POST /api/activate              привязать ключ к устройству
//   POST /api/order                 отправить чек об оплате (уходит в Telegram админу)
//   GET  /api/order?id=&token=      статус заказа и ключ после подтверждения
//   POST /api/tg                    вебхук Telegram-бота (кнопки «Выдать ключ» / «Отклонить»)
//   GET  /api/setup?s=СЕКРЕТ        один раз: подключить вебхук бота
//
// Секреты (Cloudflare → Worker → Settings → Variables and Secrets):
//   TG_BOT_TOKEN   токен бота от @BotFather
//   TG_ADMIN_CHAT  твой chat id (бот сам пришлёт его на /start)
//   TG_SECRET      любая длинная случайная строка (защита вебхука и /api/setup)

import { buildHead } from "./tail.js";

const TRIALS = 3;            // бесплатных видео на устройство
const MAX_DEVICES = 3;       // устройств на один ключ
const PRICE = 500;           // сом
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

async function getLicense(env, key) {
  if (!KEY_RE.test(key)) return null;
  const r = await env.DB.prepare("SELECT key, devices, revoked FROM licenses WHERE key = ?").bind(key).first();
  if (!r || r.revoked) return null;
  return { key: r.key, devices: JSON.parse(r.devices || "[]") };
}

// Ключ годится для устройства? При необходимости привязывает новое устройство.
async function licenseFor(env, key, device, bind) {
  const lic = await getLicense(env, key);
  if (!lic) return { ok: false, reason: "badkey" };
  if (lic.devices.includes(device)) return { ok: true };
  if (lic.devices.length >= MAX_DEVICES) return { ok: false, reason: "devices" };
  if (bind) {
    lic.devices.push(device);
    await env.DB.prepare("UPDATE licenses SET devices = ? WHERE key = ?").bind(JSON.stringify(lic.devices), key).run();
  }
  return { ok: true };
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
const STAR_PRICE = 300;                 // ⭐ за доступ навсегда (≈ 500 сом)
const SUPPORT = "@AktilekKaziev";
const siteKb = { inline_keyboard: [[{ text: "🎬 Открыть clip4k.app", url: "https://clip4k.app" }], [{ text: `⭐ Купить доступ за ${STAR_PRICE} звёзд`, callback_data: "buy" }]] };
const WELCOME = `Привет! Это Clip4K 👋

TikTok часто сжимает видео до 576p. Clip4K готовит файл так, чтобы ролик выходил в 1440p / 2K и 60 fps.

1. Откройте clip4k.app
2. Загрузите видео и нажмите «Подготовить»
3. Скачайте и публикуйте в TikTok

🎁 3 видео бесплатно
💎 Дальше — 500 сом навсегда (Mbank / O!Bank на сайте) или ${STAR_PRICE} ⭐ прямо здесь: /buy`;
const isAdmin = (env, chatId) => env.TG_ADMIN_CHAT && String(chatId) === String(env.TG_ADMIN_CHAT).trim();

async function handleTg(req, env) {
  if (!env.TG_SECRET || req.headers.get("x-telegram-bot-api-secret-token") !== String(env.TG_SECRET).trim()) return new Response("forbidden", { status: 403 });
  const u = await req.json().catch(() => ({}));
  if (u.callback_query) {
    const q = u.callback_query, chat = q.message && q.message.chat && q.message.chat.id;
    if (q.data === "buy") {
      await tg(env, "answerCallbackQuery", { callback_query_id: q.id });
      await tg(env, "sendInvoice", { chat_id: chat, title: "Clip4K — доступ навсегда", description: `Безлимитная подготовка видео для TikTok в 2K/4K 60 fps. Ключ придёт сразу после оплаты, до ${MAX_DEVICES} устройств.`, payload: "lic", currency: "XTR", prices: [{ label: "Clip4K — доступ навсегда", amount: STAR_PRICE }] });
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
    const q = u.pre_checkout_query, okPayload = /^(lic|topup)$/.test(String(q.invoice_payload || "").split(":")[0]);
    await tg(env, "answerPreCheckoutQuery", okPayload ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: "Счёт устарел, нажмите /buy ещё раз" });
    return json({ ok: true });
  }
  const msg = u.message;
  if (msg && msg.successful_payment) {
    const sp = msg.successful_payment, chat = msg.chat.id, who = msg.from ? (msg.from.username ? "@" + msg.from.username : msg.from.first_name || "") : "";
    const kind = String(sp.invoice_payload || "").split(":")[0], charge = "tg:" + sp.telegram_payment_charge_id;
    if (kind === "lic") {
      // Telegram может прислать одно и то же событие повторно — не выдаём второй ключ
      const had = await env.DB.prepare("SELECT key FROM licenses WHERE order_id = ?").bind(charge).first();
      const key = had ? had.key : newKey();
      if (!had) await env.DB.prepare("INSERT INTO licenses (key, created, order_id, devices, note) VALUES (?, ?, ?, '[]', ?)").bind(key, now(), charge, `stars ${sp.total_amount} ${who}`.slice(0, 100)).run();
      await tg(env, "sendMessage", { chat_id: chat, text: `✅ Оплата получена, спасибо!\n\nВаш ключ: ${key}\n\nОткройте clip4k.app → «У меня уже есть ключ» → вставьте ключ. Работает навсегда, до ${MAX_DEVICES} устройств.`, reply_markup: siteKb });
      if (env.TG_ADMIN_CHAT && !had) await tg(env, "sendMessage", { chat_id: String(env.TG_ADMIN_CHAT).trim(), text: `⭐ Покупка за звёзды: ${sp.total_amount} ⭐ от ${who}\nКлюч ${key}` });
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
      await invoice("lic", "Clip4K — доступ навсегда", `Безлимитная подготовка видео для TikTok в 2K/4K 60 fps. Ключ придёт сразу после оплаты, до ${MAX_DEVICES} устройств.`, STAR_PRICE);
    else if (/^\/topup\b/.test(t)) {
      // пополнить баланс бота звёздами (например, чтобы оплатить рекламу). Может оплатить любой аккаунт.
      const n = Math.floor(Number(t.replace(/^\/topup\s*/, "")) || 0);
      if (n < 1 || n > 100000) await reply("Напишите количество звёзд, например: /topup 100");
      else await invoice("topup", "Пополнение баланса Clip4K", `Перевод ${n} звёзд на баланс бота @clip4k_pay_bot.`, n);
    } else if (/^\/(paysupport|help)\b/.test(t))
      await reply(`Вопросы по оплате и ключам: ${SUPPORT}\nЕсли ключ не пришёл — напишите, приложив дату оплаты.`);
    else if (isAdmin(env, chat) && /^\/newkey\b/.test(t)) {
      const key = newKey(), note = t.replace(/^\/newkey\s*/, "").slice(0, 100) || "вручную";
      await env.DB.prepare("INSERT INTO licenses (key, created, devices, note) VALUES (?, ?, '[]', ?)").bind(key, now(), note).run();
      await reply(`Новый ключ: ${key}`);
    } else if (isAdmin(env, chat) && /^\/stats\b/.test(t)) {
      const a = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM licenses WHERE revoked = 0) AS lic, (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pend, (SELECT COUNT(*) FROM orders WHERE status = 'approved') AS paid, (SELECT COUNT(*) FROM trials) AS trialdev").first();
      await reply(`Ключей: ${a.lic}\nОплачено заказов: ${a.paid} (≈ ${a.paid * PRICE} сом)\nЖдут проверки: ${a.pend}\nУстройств с пробными: ${a.trialdev}`);
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

  if (p === "/api/status" && req.method === "GET") {
    const device = url.searchParams.get("device") || "", key = normKey(url.searchParams.get("key"));
    if (!DEV_RE.test(device)) return json({ error: "device" }, 400);
    const lic = key ? await licenseFor(env, key, device, false) : { ok: false };
    return json({ licensed: lic.ok, keyError: key && !lic.ok ? lic.reason : undefined, trialsLeft: await trialsLeft(env, device), trials: TRIALS, price: PRICE });
  }

  if (p === "/api/activate" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const device = String(b.device || ""), key = normKey(b.key);
    if (!DEV_RE.test(device)) return json({ error: "device" }, 400);
    const r = await licenseFor(env, key, device, true);
    return r.ok ? json({ ok: true, key }) : json({ error: r.reason }, r.reason === "devices" ? 409 : 404);
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
      if (!r.ok) return json({ error: r.reason }, r.reason === "devices" ? 409 : 403);
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

  if (p === "/api/order" && req.method === "POST") {
    if (!env.TG_BOT_TOKEN || !env.TG_ADMIN_CHAT) return json({ error: "notready" }, 503);
    const ip = await ipHash(req, env);
    if (await ipCount(env, ip, "order", 3600e3) >= 3) return json({ error: "often" }, 429);
    const fd = await req.formData().catch(() => null);
    const file = fd && fd.get("receipt"), contact = String((fd && fd.get("contact")) || "").trim().slice(0, 80), device = String((fd && fd.get("device")) || "");
    if (!file || typeof file === "string" || !file.size) return json({ error: "receipt" }, 400);
    if (file.size > 8 << 20) return json({ error: "receipt-big" }, 413);
    if (!/^image\//.test(file.type) && file.type !== "application/pdf") return json({ error: "receipt-type" }, 415);
    if (contact.length < 3) return json({ error: "contact" }, 400);
    if (!DEV_RE.test(device)) return json({ error: "device" }, 400);
    const id = randStr(8), token = randStr(24);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO orders (id, token, created, contact, device, ip) VALUES (?, ?, ?, ?, ?, ?)").bind(id, token, now(), contact, device, ip),
      env.DB.prepare("INSERT INTO ipuse (ip, ts, kind) VALUES (?, ?, 'order')").bind(ip, now()),
    ]);
    const caption = `🧾 Заказ ${id}\n💰 ${PRICE} сом, доступ навсегда\n👤 ${contact}\n📱 устройство ${device.slice(0, 8)}…\n\nПроверь поступление денег и нажми кнопку.`;
    const tgf = new FormData();
    tgf.set("chat_id", String(env.TG_ADMIN_CHAT).trim());
    tgf.set("caption", caption);
    tgf.set("reply_markup", JSON.stringify({ inline_keyboard: [[{ text: "✅ Выдать ключ", callback_data: `ok:${id}` }, { text: "❌ Отклонить", callback_data: `no:${id}` }]] }));
    const isImg = /^image\/(jpeg|png|webp)$/.test(file.type);
    tgf.set(isImg ? "photo" : "document", file, file.name || "receipt");
    let r = await tg(env, isImg ? "sendPhoto" : "sendDocument", tgf);
    if (!r.ok && isImg) { tgf.delete("photo"); tgf.set("document", file, file.name || "receipt"); r = await tg(env, "sendDocument", tgf); }
    if (!r.ok) { await env.DB.prepare("DELETE FROM orders WHERE id = ?").bind(id).run(); return json({ error: "tg", detail: String(r.description || "").slice(0, 120) }, 502); }
    await env.DB.prepare("UPDATE orders SET tg_msg = ? WHERE id = ?").bind(r.result.message_id, id).run();
    return json({ id, token });
  }

  if (p === "/api/order" && req.method === "GET") {
    const o = await env.DB.prepare("SELECT status, token, license_key FROM orders WHERE id = ?").bind(url.searchParams.get("id") || "").first();
    if (!o || o.token !== url.searchParams.get("token")) return json({ error: "notfound" }, 404);
    return json({ status: o.status, key: o.status === "approved" ? o.license_key : undefined });
  }

  if (p === "/api/tg" && req.method === "POST") return handleTg(req, env);

  if (p === "/api/setup" && req.method === "GET") {
    if (!env.TG_SECRET || url.searchParams.get("s") !== String(env.TG_SECRET).trim())
      // подсказка без значений: какие секреты сайт видит
      return json({ error: "forbidden", TG_SECRET: env.TG_SECRET ? "есть, но не совпадает со ссылкой" : "НЕТ", TG_BOT_TOKEN: env.TG_BOT_TOKEN ? "есть" : "НЕТ", TG_ADMIN_CHAT: env.TG_ADMIN_CHAT ? "есть" : "НЕТ" }, 403);
    const hook = await tg(env, "setWebhook", { url: `${url.origin}/api/tg`, secret_token: String(env.TG_SECRET).trim(), allowed_updates: ["message", "callback_query", "pre_checkout_query"] });
    const pub = [{ command: "start", description: "Что такое Clip4K" }, { command: "buy", description: `Доступ навсегда за ${STAR_PRICE} ⭐` }, { command: "paysupport", description: "Помощь с оплатой" }];
    const cmds = await tg(env, "setMyCommands", { commands: pub });
    if (env.TG_ADMIN_CHAT) await tg(env, "setMyCommands", { scope: { type: "chat", chat_id: Number(String(env.TG_ADMIN_CHAT).trim()) }, commands: [...pub, { command: "id", description: "Показать chat id" }, { command: "newkey", description: "Создать ключ вручную" }, { command: "stats", description: "Статистика" }, { command: "revoke", description: "Отключить ключ" }, { command: "topup", description: "Пополнить баланс бота звёздами" }] });
    await tg(env, "setMyDescription", { description: "Clip4K: видео в TikTok в 2K 60 fps, а не 576p. 3 видео бесплатно, дальше доступ навсегда." });
    await tg(env, "setMyShortDescription", { short_description: "TikTok в 2K 60 fps вместо 576p · clip4k.app" });
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
