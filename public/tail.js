// tail.js (в браузере) — подготовка MP4 и разбор для сервера.
// Сам хвост добавляет сервер (src/tail.js), здесь только сборка файла по его ответу.

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

export const DEFAULT_PAD = 9112;
// Один пустой семпл: длина NAL = 4 и сам NAL из четырёх нулей (тип 0).
export const DEFAULT_SAMPLE = new Uint8Array([0, 0, 0, 4, 0, 0, 0, 0]);

const u32 = (u, o) => ((u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3]) >>> 0;
const w32 = (u, o, v) => { u[o] = (v >>> 24) & 255; u[o + 1] = (v >>> 16) & 255; u[o + 2] = (v >>> 8) & 255; u[o + 3] = v & 255; };
const cc = (u, o) => String.fromCharCode(u[o], u[o + 1], u[o + 2], u[o + 3]);

function concat(list) {
  let n = 0;
  for (const a of list) n += a.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const a of list) { out.set(a, o); o += a.length; }
  return out;
}

function parseBoxes(u, start, end) {
  const boxes = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = u32(u, pos);
    const type = cc(u, pos + 4);
    let hdr = 8;
    if (size === 1) {
      size = u32(u, pos + 8) * 4294967296 + u32(u, pos + 12);
      hdr = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < hdr || pos + size > end) throw new Error("битый блок " + type + " на позиции " + pos);
    boxes.push({ type, pos, size, hdr });
    pos += size;
  }
  return boxes;
}

function parseTree(u, start, end) {
  return parseBoxes(u, start, end).map(b =>
    CONTAINERS.has(b.type)
      ? { type: b.type, children: parseTree(u, b.pos + b.hdr, b.pos + b.size), payload: null }
      : { type: b.type, children: null, payload: u.subarray(b.pos + b.hdr, b.pos + b.size) });
}

function serialize(box) {
  let body;
  if (box.children) body = concat(box.children.map(serialize));
  else body = box.payload;
  const out = new Uint8Array(8 + body.length);
  w32(out, 0, 8 + body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = box.type.charCodeAt(i);
  out.set(body, 8);
  return out;
}

const find = (box, t) => (box.children || []).find(c => c.type === t) || null;
const findAll = (box, t) => (box.children || []).filter(c => c.type === t);
const stblOf = trak => find(find(find(trak, "mdia"), "minf"), "stbl");

function handlerType(trak) {
  const mdia = find(trak, "mdia");
  const hdlr = mdia && find(mdia, "hdlr");
  return hdlr ? cc(hdlr.payload, 8) : null;
}

function readStts(p) {
  const n = u32(p, 4);
  const e = [];
  for (let i = 0; i < n; i++) e.push([u32(p, 8 + 8 * i), u32(p, 12 + 8 * i)]);
  return e;
}

function writeStts(entries) {
  const out = new Uint8Array(8 + 8 * entries.length);
  w32(out, 4, entries.length);
  entries.forEach(([c, d], i) => { w32(out, 8 + 8 * i, c); w32(out, 12 + 8 * i, d); });
  return out;
}

function shiftAllOffsets(moov, delta) {
  if (!delta) return;
  for (const trak of findAll(moov, "trak")) {
    const stbl = stblOf(trak);
    const stco = find(stbl, "stco");
    const co64 = find(stbl, "co64");
    if (stco) {
      const p = stco.payload.slice();
      const n = u32(p, 4);
      for (let i = 0; i < n; i++) w32(p, 8 + 4 * i, u32(p, 8 + 4 * i) + delta);
      stco.payload = p;
    }
    if (co64) {
      const p = co64.payload.slice();
      const n = u32(p, 4);
      const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
      for (let i = 0; i < n; i++) dv.setBigUint64(8 + 8 * i, dv.getBigUint64(8 + 8 * i) + BigInt(delta));
      co64.payload = p;
    }
  }
}

function readInfo(moov) {
  const trak = findAll(moov, "trak").find(t => handlerType(t) === "vide");
  if (!trak) return null;
  const stbl = stblOf(trak);
  const stsd = find(stbl, "stsd");
  const sampleEntry = stsd ? cc(stsd.payload, 12) : "";
  const mdhd = find(find(trak, "mdia"), "mdhd").payload;
  const timescale = u32(mdhd, mdhd[0] === 1 ? 20 : 12);
  const tkhd = find(trak, "tkhd").payload;
  const wOff = tkhd[0] === 1 ? 88 : 76;
  const width = u32(tkhd, wOff) / 65536;
  const height = u32(tkhd, wOff + 4) / 65536;
  const stts = readStts(find(stbl, "stts").payload);
  const frames = stts.reduce((s, [c]) => s + c, 0);
  const ticks = stts.reduce((s, [c, d]) => s + c * d, 0);
  const sizes = u32(find(stbl, "stsz").payload, 8);
  return { trak, sampleEntry, timescale, width, height, frames, samples: sizes, seconds: ticks / timescale, fps: ticks ? frames * timescale / ticks : 0 };
}

// Перевод видеодорожки на мелкий шаг времени (по умолчанию 1/90000 с, как ffmpeg в Termux).
// Браузерный кодировщик пишет шаг 1/fps, и тогда «укорачивание последнего кадра» в хвосте
// ничего не меняет. Меняются только числа в mdhd/stts/ctts/elst, размер файла тот же.
export function retimeVideo(input, target = 90000) {
  const u = input instanceof Uint8Array ? input : new Uint8Array(input);
  const top = parseBoxes(u, 0, u.length);
  const m = top.find(b => b.type === "moov");
  if (!m) return { buf: u, from: 0, to: 0 };
  // Ищем блоки по месту в файле, чтобы править байты на месте
  const kids = (s, e) => parseBoxes(u, s, e);
  const child = (box, t) => kids(box.pos + box.hdr, box.pos + box.size).find(b => b.type === t);
  for (const trak of kids(m.pos + m.hdr, m.pos + m.size).filter(b => b.type === "trak")) {
    const mdia = child(trak, "mdia"); if (!mdia) continue;
    const hdlr = child(mdia, "hdlr"); if (!hdlr || cc(u, hdlr.pos + hdlr.hdr + 8) !== "vide") continue;
    const mdhd = child(mdia, "mdhd"), p = mdhd.pos + mdhd.hdr, v1 = u[p] === 1;
    const ts = u32(u, p + (v1 ? 20 : 12));
    if (ts >= 1000) return { buf: u, from: ts, to: ts };
    const k = Math.max(2, Math.round(target / ts));
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    const mul32 = o => { const x = u32(u, o) * k; if (x >= 4294967296) throw new Error("слишком длинное видео для пересчёта"); w32(u, o, x); };
    w32(u, p + (v1 ? 20 : 12), ts * k);
    if (v1) dv.setBigUint64(p + 24, dv.getBigUint64(p + 24) * BigInt(k)); else mul32(p + 16);
    const stbl = child(child(mdia, "minf"), "stbl");
    const stts = child(stbl, "stts"), sp = stts.pos + stts.hdr;
    for (let i = 0, n = u32(u, sp + 4); i < n; i++) mul32(sp + 12 + 8 * i);
    const ctts = child(stbl, "ctts");
    if (ctts) { const q = ctts.pos + ctts.hdr; for (let i = 0, n = u32(u, q + 4); i < n; i++) { const o = q + 12 + 8 * i; w32(u, o, (dv.getInt32(o) * k) >>> 0); } }
    const edts = child(trak, "edts"), elst = edts && child(edts, "elst");
    if (elst) {
      const q = elst.pos + elst.hdr, ev1 = u[q] === 1;
      for (let i = 0, n = u32(u, q + 4); i < n; i++) {
        if (ev1) { const o = q + 8 + 20 * i + 8, t = dv.getBigInt64(o); if (t > 0n) dv.setBigInt64(o, t * BigInt(k)); }
        else { const o = q + 8 + 12 * i + 4, t = dv.getInt32(o); if (t > 0) w32(u, o, t * k); }
      }
    }
    return { buf: u, from: ts, to: ts * k };
  }
  return { buf: u, from: 0, to: 0 };
}

// Исправление меток времени звука AAC. Кодировщик в Safari иногда выдаёт пачки пакетов
// с одинаковым временем (в stts длительность 0). В AAC каждый пакет = 1024 отсчёта,
// поэтому таблицу можно честно пересобрать. Нужно, чтобы moov стоял после mdat.
export function fixAacTiming(input) {
  const u = input instanceof Uint8Array ? input : new Uint8Array(input);
  const top = parseBoxes(u, 0, u.length);
  const mi = top.findIndex(b => b.type === "moov");
  if (mi < 0 || top.slice(mi + 1).some(b => b.type === "mdat")) return { buf: u, fixed: false };
  const mo = top[mi];
  const moov = { type: "moov", payload: null, children: parseTree(u, mo.pos + mo.hdr, mo.pos + mo.size) };
  let fixed = false;
  for (const trak of findAll(moov, "trak")) {
    if (handlerType(trak) !== "soun") continue;
    const stbl = stblOf(trak), stsd = find(stbl, "stsd");
    if (!stsd || cc(stsd.payload, 12) !== "mp4a") continue;
    const stts = find(stbl, "stts"), e = readStts(stts.payload);
    if (!e.some(([c, d]) => c && d === 0)) continue;
    const n = e.reduce((s, [c]) => s + c, 0);
    stts.payload = writeStts([[n, 1024]]);
    const mdhd = find(find(trak, "mdia"), "mdhd"), p = mdhd.payload.slice();
    if (p[0] === 1) new DataView(p.buffer).setBigUint64(24, BigInt(n * 1024)); else w32(p, 16, n * 1024);
    mdhd.payload = p;
    fixed = true;
  }
  if (!fixed) return { buf: u, fixed };
  const mb = serialize(moov);
  const out = new Uint8Array(mo.pos + mb.length + (u.length - mo.pos - mo.size));
  out.set(u.subarray(0, mo.pos), 0); out.set(mb, mo.pos); out.set(u.subarray(mo.pos + mo.size), mo.pos + mb.length);
  return { buf: out, fixed };
}

// ftyp как у ffmpeg (isom, 512, isom iso2 avc1 mp41). Работает, когда moov стоит последним.
export function ffmpegFtyp(input) {
  const u = input instanceof Uint8Array ? input : new Uint8Array(input);
  const top = parseBoxes(u, 0, u.length);
  const ft = top[0], mo = top[top.length - 1];
  if (!ft || ft.type !== "ftyp" || !mo || mo.type !== "moov") return u;
  const delta = FTYP_ISOM.length - ft.size;
  if (!delta && u.subarray(0, ft.size).every((b, i) => b === FTYP_ISOM[i])) return u;
  const moov = { type: "moov", payload: null, children: parseTree(u, mo.pos + mo.hdr, mo.pos + mo.size) };
  shiftAllOffsets(moov, delta);
  const mb = serialize(moov);
  const out = new Uint8Array(u.length + delta);
  out.set(FTYP_ISOM, 0);
  out.set(u.subarray(ft.size, mo.pos), FTYP_ISOM.length);
  out.set(mb, mo.pos + delta);
  return out;
}

// Проверка файла без изменений: подходит ли он для добавления хвоста.
export function inspectMp4(input, opts = {}) {
  const u = input instanceof Uint8Array ? input : new Uint8Array(input);
  const top = parseBoxes(u, 0, u.length);
  if (top.some(b => b.type === "moof")) return { ok: false, reason: "fragmented" };
  const m = top.filter(b => b.type === "moov");
  if (m.length !== 1) return { ok: false, reason: "no-moov" };
  const moov = { type: "moov", children: parseTree(u, m[0].pos + m[0].hdr, m[0].pos + m[0].size), payload: null };
  const info = readInfo(moov);
  if (!info) return { ok: false, reason: "no-video" };
  const okCodec = ["avc1", "avc3"].concat(opts.allowHevc ? ["hvc1", "hev1"] : []);
  if (!okCodec.includes(info.sampleEntry)) return { ok: false, reason: "not-h264", codec: info.sampleEntry };
  const { trak, ...rest } = info;
  return { ok: true, ...rest };
}

// ---------------------------------------------------------------------------
// Раскладка "shared" (как у Zilem): один блок mdat, пустой семпл лежит в его конце,
// а все pad записей в таблице чанков указывают на этот один семпл (по 1 семпл в чанке).
// ---------------------------------------------------------------------------
const FTYP_ISOM = (() => {
  const b = new Uint8Array(32);
  w32(b, 0, 32);
  b.set([0x66, 0x74, 0x79, 0x70], 4);                 // ftyp
  b.set([0x69, 0x73, 0x6f, 0x6d], 8);                 // major: isom
  w32(b, 12, 512);                                   // minor
  b.set([0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, 0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31], 16); // isom iso2 avc1 mp41
  return b;
})();

// Разбор файла для отправки на сервер: только ftyp и moov, плюс где лежит mdat.
export function splitMp4(input) {
  const u = input instanceof Uint8Array ? input : new Uint8Array(input);
  const top = parseBoxes(u, 0, u.length);
  if (top.some(b => b.type === "moof")) return { ok: false, reason: "fragmented" };
  const mo = top.filter(b => b.type === "moov"), md = top.filter(b => b.type === "mdat");
  if (mo.length !== 1 || md.length !== 1) return { ok: false, reason: "layout" };
  const ft = top[0].type === "ftyp" ? top[0] : null;
  return { ok: true, ftyp: ft ? u.subarray(ft.pos, ft.pos + ft.size) : new Uint8Array(0),
    moov: u.subarray(mo[0].pos, mo[0].pos + mo[0].size), mdat: u.subarray(md[0].pos, md[0].pos + md[0].size),
    mdatPos: md[0].pos, mdatSize: md[0].size };
}

// Сборка итогового файла по ответу сервера.
export function assemble(parts, head) {
  const pad = head.pad;
  let tail;
  if (head.layout === "audio") {
    tail = new Uint8Array(8 * pad + 8);
    for (let i = 0; i < pad; i++) tail[8 * i + 3] = 4;                     // 00000004 00000000
    tail.set([0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65], 8 * pad);              // в конце блок free
  } else {
    tail = new Uint8Array(8 + 8 * pad);
    w32(tail, 0, tail.length); tail.set([0x6d, 0x64, 0x61, 0x74], 4);     // mdat
    for (let i = 0; i < pad; i++) tail.set(DEFAULT_SAMPLE, 8 + 8 * i);
  }
  return new Blob([parts.ftyp, head.moov, parts.mdat, tail], { type: "video/mp4" });
}
