// src/tail.js — серверная часть: добавление хвоста по одному лишь «оглавлению» файла.
// Клиент присылает ftyp и moov и сообщает, где лежит mdat. Сервер возвращает новый moov,
// а клиент собирает файл: ftyp + moov' + исходный mdat + хвост.
// Логика совпадает с прежним public/tail.js (проверено байт в байт на файле RTX Fury).

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts"]);

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

function boxSize(box) {
  if (box.children) { let n = 8; for (const c of box.children) n += boxSize(c); return n; }
  return 8 + box.payload.length;
}

function serialize(box) {
  const out = new Uint8Array(boxSize(box));
  const put = (bx, o) => {
    const n = boxSize(bx);
    w32(out, o, n);
    for (let i = 0; i < 4; i++) out[o + 4 + i] = bx.type.charCodeAt(i);
    let p = o + 8;
    if (bx.children) for (const c of bx.children) p = put(c, p);
    else { out.set(bx.payload, p); p += bx.payload.length; }
    return p;
  };
  put(box, 0);
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

function patchVideoTrak(trak, pad, sample, trim, explicitStts) {
  const stbl = stblOf(trak);

  // stsz: размеры семплов
  const stsz = find(stbl, "stsz");
  const uniform = u32(stsz.payload, 4);
  const count = u32(stsz.payload, 8);
  const total = count + pad;
  const nz = new Uint8Array(12 + 4 * total);
  w32(nz, 8, total);
  for (let i = 0; i < count; i++) {
    w32(nz, 12 + 4 * i, uniform || u32(stsz.payload, 12 + 4 * i));
  }
  for (let i = 0; i < pad; i++) w32(nz, 12 + 4 * (count + i), sample.length);
  stsz.payload = nz;

  // stts: длительности
  const stts = find(stbl, "stts");
  let entries = readStts(stts.payload);
  if (trim && entries.length) {
    const last = entries[entries.length - 1];
    if (last[0] === 1) entries[entries.length - 1] = [1, 1];
    else { entries[entries.length - 1] = [last[0] - 1, last[1]]; entries.push([1, 1]); }
  }
  const realTotal = entries.reduce((s, [c, d]) => s + c * d, 0);
  if (explicitStts) entries.push([pad, 1]);
  const merged = [];
  for (const [c, d] of entries) {
    if (merged.length && merged[merged.length - 1][1] === d) merged[merged.length - 1][0] += c;
    else merged.push([c, d]);
  }
  stts.payload = writeStts(merged);

  // ctts: только в явном режиме
  const ctts = find(stbl, "ctts");
  if (ctts && explicitStts) {
    const p = ctts.payload;
    const n = u32(p, 4);
    const out = new Uint8Array(p.length + 8);
    out.set(p, 0);
    w32(out, 4, n + 1);
    w32(out, p.length, pad);
    w32(out, p.length + 4, 0);
    ctts.payload = out;
  }

  // stsc: пустые семплы лежат одним новым куском
  const stco = find(stbl, "stco");
  const co64 = find(stbl, "co64");
  const nChunks = u32((stco || co64).payload, 4);
  const stsc = find(stbl, "stsc");
  const sp = stsc.payload;
  const sn = u32(sp, 4);
  const so = new Uint8Array(sp.length + 12);
  so.set(sp, 0);
  w32(so, 4, sn + 1);
  w32(so, sp.length, nChunks + 1);
  w32(so, sp.length + 4, pad);
  w32(so, sp.length + 8, 1);
  stsc.payload = so;

  return { realTotal, framesBefore: count };
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

function appendChunkOffset(trak, offset) {
  const stbl = stblOf(trak);
  const stco = find(stbl, "stco");
  if (stco) {
    if (offset >= 4294967296) throw new Error("файл больше 4 ГБ не поддерживается");
    const p = stco.payload;
    const out = new Uint8Array(p.length + 4);
    out.set(p, 0);
    w32(out, 4, u32(p, 4) + 1);
    w32(out, p.length, offset);
    stco.payload = out;
  } else {
    const co64 = find(stbl, "co64");
    const p = co64.payload;
    const out = new Uint8Array(p.length + 8);
    out.set(p, 0);
    w32(out, 4, u32(p, 4) + 1);
    new DataView(out.buffer).setBigUint64(p.length, BigInt(offset));
    co64.payload = out;
  }
}

function setDurations(moov, trak, realTotal) {
  const mdhd = find(find(trak, "mdia"), "mdhd");
  const p = mdhd.payload.slice();
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  let ts;
  if (p[0] === 1) { ts = u32(p, 20); dv.setBigUint64(24, BigInt(realTotal)); }
  else { ts = u32(p, 12); w32(p, 16, realTotal); }
  mdhd.payload = p;

  const mvhd = find(moov, "mvhd");
  const mvTs = u32(mvhd.payload, mvhd.payload[0] === 1 ? 20 : 12);
  const tkhd = find(trak, "tkhd");
  const t = tkhd.payload.slice();
  const dur = Math.round(realTotal * mvTs / ts);
  if (t[0] === 1) new DataView(t.buffer, t.byteOffset, t.byteLength).setBigUint64(28, BigInt(dur));
  else w32(t, 20, dur);
  tkhd.payload = t;
}

const FTYP_ISOM = (() => {
  const b = new Uint8Array(32);
  w32(b, 0, 32);
  b.set([0x66, 0x74, 0x79, 0x70], 4);                 // ftyp
  b.set([0x69, 0x73, 0x6f, 0x6d], 8);                 // major: isom
  w32(b, 12, 512);                                   // minor
  b.set([0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, 0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31], 16); // isom iso2 avc1 mp41
  return b;
})();

const enc = s => new TextEncoder().encode(s);
function box(type, ...parts) { return { type, payload: concat(parts.map(p => typeof p === "string" ? enc(p) : p)), children: null }; }
function u32b(v) { const b = new Uint8Array(4); w32(b, 0, v); return b; }

// Подпись программы (©too) из исходного файла, например «Lavf60.16.100». Void сохраняет её как есть;
// свою подпись (clip4k.app и т.п.) TikTok с ноября 2026, похоже, распознаёт. Нет подписи — ставим обычную ffmpeg.
export const FALLBACK_TOOL = "Lavf60.16.100";
export function originalTool(moov) {
  const t = [0xa9, 0x74, 0x6f, 0x6f];   // ©too
  for (let i = 4; i + 24 < moov.length; i++) {
    if (moov[i] !== t[0] || moov[i + 1] !== t[1] || moov[i + 2] !== t[2] || moov[i + 3] !== t[3]) continue;
    const d = i + 4;   // внутри: [size]data[ver/flags 4][locale 4] текст
    if (moov[d + 4] !== 0x64 || moov[d + 5] !== 0x61 || moov[d + 6] !== 0x74 || moov[d + 7] !== 0x61) continue;
    const size = u32(moov, d), raw = moov.subarray(d + 16, d + size);
    let end = raw.length; while (end && raw[end - 1] === 0) end--;
    const text = new TextDecoder().decode(raw.subarray(0, end));
    if (/^[\x20-\x7e]{1,64}$/.test(text)) return text;
  }
  return null;
}

function toolTag(text) {
  const data = box("data", u32b(1), u32b(0), text, new Uint8Array([0]));
  const too = { type: "©too", payload: serialize(data), children: null };
  const ilst = box("ilst", serialize(too));
  const hdlr = box("hdlr", new Uint8Array(8), "mdir", new Uint8Array(13));
  const meta = box("meta", new Uint8Array(4), serialize(hdlr), serialize(ilst));
  return box("udta", serialize(meta));
}

function trimHdlr(trak) {
  const mdia = find(trak, "mdia"), h = mdia && find(mdia, "hdlr");
  if (!h || h.payload.length < 24) return;
  // version/flags(4) pre_defined(4) handler(4) reserved(12) name → reserved(8) name
  h.payload = concat([h.payload.subarray(0, 20), h.payload.subarray(24)]);
}


// layout "audio": как у RTX Fury. Если в файле нет звука — "chunk" (как Termux-скрипты).
// Итоговый файл: [ftyp][moov'][mdat как был][хвост].
export function buildHead({ ftyp, moov, mdatPos, mdatSize, layout = "audio", pad: padOpt, tag = null, mult = 9 }) {
  const mo = parseBoxes(moov, 0, moov.length);
  if (mo.length !== 1 || mo[0].type !== "moov") throw new Error("ожидался один блок moov");
  const M = mo[0];
  const fresh = () => ({ type: "moov", payload: null, children: parseTree(moov, M.hdr, M.size) });
  const hasAudio = findAll(fresh(), "trak").some(t => handlerType(t) === "soun");
  const useAudio = layout !== "chunk" && hasAudio;

  if (useAudio) {
    // Строим дерево один раз: размер moov не зависит от значений смещений,
    // поэтому сначала узнаём размер, потом сдвигаем смещения и сериализуем ещё раз.
    const m = fresh();
    const traks = findAll(m, "trak");
    const vid = traks.find(t => handlerType(t) === "vide");
    const aud = traks.find(t => handlerType(t) === "soun");
    if (!vid) throw new Error("нет видеодорожки");
    for (const t of traks) trimHdlr(t);
    const sa = serialize(aud);
    const copy = { type: "trak", payload: null, children: parseTree(sa, 8, sa.length) };
    copy.children = copy.children.filter(c => c.type !== "edts" && c.type !== "udta");
    const mvhd = find(m, "mvhd"), p = mvhd.payload, v1 = p[0] === 1;
    const ts = u32(p, v1 ? 20 : 12), rest = p.subarray(v1 ? 32 : 20);
    const nextId = u32(rest, rest.length - 4);
    const nv = new Uint8Array(32 + rest.length);
    nv[0] = 1; w32(nv, 20, ts);
    for (let i = 24; i < 32; i++) nv[i] = 255;
    nv.set(rest, 32); w32(nv, nv.length - 4, nextId + 1);
    mvhd.payload = nv;
    const tk = find(copy, "tkhd"), tp = tk.payload.slice();
    w32(tp, tp[0] === 1 ? 20 : 12, nextId); tk.payload = tp;
    const stbl = stblOf(copy);
    const stsz = find(stbl, "stsz"), uni = u32(stsz.payload, 4), cnt = u32(stsz.payload, 8), pad = cnt * mult;
    const nz = new Uint8Array(12 + 4 * (cnt + pad)); w32(nz, 8, cnt + pad);
    if (uni) for (let i = 0; i < cnt; i++) w32(nz, 12 + 4 * i, uni);
    else nz.set(stsz.payload.subarray(12, 12 + 4 * cnt), 12);
    for (let i = 0; i < pad; i++) nz[12 + 4 * (cnt + i) + 3] = 8;
    stsz.payload = nz;
    const stts = find(stbl, "stts"), e = readStts(stts.payload); e.push([pad, 1]); stts.payload = writeStts(e);
    const co = find(stbl, "stco") || find(stbl, "co64"), nCh = u32(co.payload, 4);
    const stsc = find(stbl, "stsc"), sp = stsc.payload, so = new Uint8Array(sp.length + 12);
    so.set(sp); w32(so, 4, u32(sp, 4) + 1); w32(so, sp.length, nCh + 1); w32(so, sp.length + 4, pad); w32(so, sp.length + 8, 1);
    stsc.payload = so;
    vid.children = vid.children.filter(c => c.type !== "udta").concat([toolTag(tag || originalTool(moov) || FALLBACK_TOOL)]);
    m.children = m.children.filter(c => c.type !== "udta").concat([copy]);
    // размер: смещение хвоста пока 0, ширина поля от значения не зависит
    appendChunkOffset(copy, 0);
    let size = 8; for (const c of m.children) size += boxSize(c);
    const newMdat = ftyp.length + size;
    shiftAllOffsets(m, newMdat - mdatPos);
    const cbox = find(stbl, "stco") || find(stbl, "co64");
    const last = cbox.payload.length - (cbox.type === "co64" ? 8 : 4), tailOff = newMdat + mdatSize;
    if (cbox.type === "co64") new DataView(cbox.payload.buffer, cbox.payload.byteOffset).setBigUint64(last, BigInt(tailOff));
    else { if (tailOff >= 4294967296) throw new Error("файл больше 4 ГБ не поддерживается"); w32(cbox.payload, last, tailOff); }
    const bytes = serialize(m);
    if (bytes.length !== size) throw new Error("внутренняя ошибка: размер moov");
    return { moov: bytes, layout: "audio", pad };
  }

  // chunk: пустые семплы видеодорожки отдельным mdat в конце
  const pad = Number.isInteger(padOpt) && padOpt > 0 && padOpt <= 99999 ? padOpt : DEFAULT_PAD;
  const build = (shift, padOffset) => {
    const m = fresh();
    const trak = findAll(m, "trak").find(t => handlerType(t) === "vide");
    if (!trak) throw new Error("нет видеодорожки");
    shiftAllOffsets(m, shift);
    const { realTotal } = patchVideoTrak(trak, pad, DEFAULT_SAMPLE, true, false);
    appendChunkOffset(trak, padOffset);
    setDurations(m, trak, realTotal);
    return serialize(m);
  };
  const probe = build(0, 0);
  const newMdat = ftyp.length + probe.length;
  const bytes = build(newMdat - mdatPos, newMdat + mdatSize + 8);
  if (bytes.length !== probe.length) throw new Error("внутренняя ошибка: размер moov изменился");
  return { moov: bytes, layout: "chunk", pad };
}

// ---------------------------------------------------------------------------
// Способ RTX Fury от 10.11.2026 («optimizer»), проверен: 1080p60 38 Мбит/с в TikTok.
// Итоговый файл: [ftyp isom][free: копия moov][free 8][mdat как был][mdat: 17 тихих кадров AAC][moov].
// В последнем moov звук удлинён тихими кадрами, у части из них второе описание формата (stsd #2),
// и добавлена третья дорожка — копия звука. На файле RTX совпадает байт в байт.
// ---------------------------------------------------------------------------
const SILENT_STEREO = new Uint8Array([0x21, 0x10, 0x04, 0x60, 0x8c, 0x1c]);   // тихий кадр AAC LC, стерео
export const RTX2_SILENT = 17;
const hexb = s => Uint8Array.from(s.match(/../g), h => parseInt(h, 16));
const STSD2_48K = hexb("000000716d703461000000000000000100000000000000000002001000000000bb8000000000003965736473000000000380808028000200048080801a401500000000030000000300000580808008118004c0400020000680808001020000001462747274000000000003000000030000");
const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

function stsd2For(rate) {
  const f = AAC_RATES.indexOf(rate);
  if (f < 3) throw new Error("частота звука " + rate + " не поддерживается");
  const b = STSD2_48K.slice();
  b[32] = (rate >>> 8) & 255; b[33] = rate & 255;                 // частота в mp4a (16.16)
  let a = -1;                                                       // AudioSpecificConfig после 05 80 80 80 08
  for (let i = 0; i < b.length - 5; i++) if (b[i] === 5 && b[i + 1] === 0x80 && b[i + 2] === 0x80 && b[i + 3] === 0x80 && b[i + 4] === 8) { a = i + 5; break; }
  if (a < 0) throw new Error("внутренняя ошибка: stsd2");
  b[a] = 0x10 | (f >> 1); b[a + 1] = ((f & 1) << 7) | (b[a + 1] & 0x7f);
  b[a + 2] = (b[a + 2] & 0xfc) | (f >> 2); b[a + 3] = ((f & 3) << 6) | (b[a + 3] & 0x3f);
  return b;
}
const u64 = (p, o) => u32(p, o) * 4294967296 + u32(p, o + 4);
function w64(p, o, v) { w32(p, o, Math.floor(v / 4294967296)); w32(p, o + 4, v % 4294967296); }
// читаем/пишем «длительность» в mvhd/tkhd/mdhd: [смещение v0, смещение v1]
const getDur = (box, o0, o1) => box.payload[0] === 1 ? u64(box.payload, o1) : u32(box.payload, o0);
function setDur(box, o0, o1, v) {
  const p = box.payload.slice();
  if (p[0] === 1) w64(p, o1, v); else { if (v >= 4294967296) throw new Error("слишком длинное видео"); w32(p, o0, v); }
  box.payload = p;
}
// udta как у ffmpeg: meta(hdlr mdir/appl, ilst ©too)
function ffUdta(text) {
  const data = box("data", u32b(1), u32b(0), text);
  const too = { type: "©too", payload: serialize(data), children: null };
  const hdlr = box("hdlr", new Uint8Array(8), "mdirappl", new Uint8Array(9));
  return box("udta", serialize(box("meta", new Uint8Array(4), serialize(hdlr), serialize(box("ilst", serialize(too))))));
}
const cloneTree = b => { const s = serialize(b); return { type: b.type, payload: null, children: parseTree(s, 8, s.length) }; };

export function buildRtx2({ moov, mdatPos, mdatSize, tag = null, silent = RTX2_SILENT }) {
  const mo = parseBoxes(moov, 0, moov.length);
  if (mo.length !== 1 || mo[0].type !== "moov") throw new Error("ожидался один блок moov");
  const m = { type: "moov", payload: null, children: parseTree(moov, mo[0].hdr, mo[0].size) };
  const traks = findAll(m, "trak");
  if (!traks.some(t => handlerType(t) === "vide")) throw new Error("нет видеодорожки");
  const aud = traks.find(t => handlerType(t) === "soun");
  if (!aud) throw new Error("нет звука");
  const sd = find(stblOf(aud), "stsd").payload;
  if (u32(sd, 4) !== 1 || cc(sd, 12) !== "mp4a") throw new Error("звук должен быть AAC");
  const channels = (sd[32] << 8) | sd[33], rate = (sd[40] << 8) | sd[41];
  if (channels !== 2) throw new Error("нужен стерео-звук");
  const stsd2 = stsd2For(rate);
  const mvhd = find(m, "mvhd");
  const mvts = u32(mvhd.payload, mvhd.payload[0] === 1 ? 20 : 12);

  // 1) moov как после обычной перепаковки ffmpeg: у дорожек есть edts, в конце udta с ©too
  for (const t of traks) {
    if (find(t, "edts")) continue;
    const el = new Uint8Array(20); w32(el, 4, 1);
    w32(el, 8, Math.min(getDur(find(t, "tkhd"), 20, 28), 4294967295)); w32(el, 16, 0x10000);
    const tk = t.children.findIndex(c => c.type === "tkhd");
    t.children.splice(tk + 1, 0, { type: "edts", payload: null, children: [box("elst", el)] });
  }
  const tool = tag || originalTool(moov) || FALLBACK_TOOL;
  m.children = m.children.filter(c => c.type !== "udta" && c.type !== "meta").concat([ffUdta(tool)]);

  // 2) раскладка: [ftyp][free(moov)][free 8][mdat][mdat тишина][moov]
  const newMdat = FTYP_ISOM.length + boxSize(m) + 8;
  shiftAllOffsets(m, newMdat - mdatPos);
  const decoy = serialize(m);
  const silentPos = newMdat + mdatSize + 8, nA = Math.ceil(silent / 2), nB = silent - nA;

  // 3) последний moov: удлиняем звук тишиной и добавляем копию звуковой дорожки
  const mm = cloneTree(m);
  const a = findAll(mm, "trak").find(t => handlerType(t) === "soun");
  const md = find(a, "mdia"), mdhd = find(md, "mdhd");
  const ats = u32(mdhd.payload, mdhd.payload[0] === 1 ? 20 : 12);
  const adur = getDur(mdhd, 16, 24) + silent * 1024;
  setDur(mdhd, 16, 24, adur);
  const ms = Math.floor(adur * mvts / ats) + 1;
  setDur(find(a, "tkhd"), 20, 28, ms);
  const elst = find(find(a, "edts"), "elst");
  if (elst && u32(elst.payload, 4) === 1) { const p = elst.payload.slice(); if (p[0] === 1) w64(p, 8, ms); else w32(p, 8, ms); elst.payload = p; }
  const st = stblOf(a);
  const stts = find(st, "stts"), e = readStts(stts.payload);
  if (e.length && e[e.length - 1][1] === 1024) e[e.length - 1][0] += silent; else e.push([silent, 1024]);
  stts.payload = writeStts(e);
  const stsz = find(st, "stsz"), uni = u32(stsz.payload, 4), cnt = u32(stsz.payload, 8);
  const nz = new Uint8Array(12 + 4 * (cnt + silent)); w32(nz, 8, cnt + silent);
  if (uni) for (let i = 0; i < cnt; i++) w32(nz, 12 + 4 * i, uni); else nz.set(stsz.payload.subarray(12, 12 + 4 * cnt), 12);
  for (let i = 0; i < silent; i++) w32(nz, 12 + 4 * (cnt + i), SILENT_STEREO.length);
  stsz.payload = nz;
  const co = find(st, "stco") || find(st, "co64"), wide = co.type === "co64", nCh = u32(co.payload, 4);
  const cp = new Uint8Array(co.payload.length + (wide ? 16 : 8)); cp.set(co.payload); w32(cp, 4, nCh + 2);
  const offB = silentPos + SILENT_STEREO.length * nA;
  if (wide) { w64(cp, co.payload.length, silentPos); w64(cp, co.payload.length + 8, offB); }
  else { if (offB >= 4294967296) throw new Error("файл больше 4 ГБ не поддерживается"); w32(cp, co.payload.length, silentPos); w32(cp, co.payload.length + 4, offB); }
  co.payload = cp;
  const sbgp = find(st, "sbgp");
  if (sbgp && cc(sbgp.payload, 4) === "roll" && sbgp.payload[0] === 0) {
    const p = sbgp.payload, n = u32(p, 8), q = new Uint8Array(p.length + 8);
    q.set(p); w32(q, 8, n + 1); w32(q, p.length, silent); sbgp.payload = q;
  }
  const stsc = find(st, "stsc"), sp = stsc.payload;
  const withStsc = desc => { const q = new Uint8Array(sp.length + 24); q.set(sp); w32(q, 4, u32(sp, 4) + 2);
    w32(q, sp.length, nCh + 1); w32(q, sp.length + 4, nA); w32(q, sp.length + 8, 1);
    w32(q, sp.length + 12, nCh + 2); w32(q, sp.length + 16, nB); w32(q, sp.length + 20, desc); return q; };
  const copy = cloneTree(a);                                           // третья дорожка: всё одним описанием
  stsc.payload = withStsc(2);
  const stsd = find(st, "stsd"), s0 = stsd.payload, s2 = new Uint8Array(s0.length + stsd2.length);
  s2.set(s0); w32(s2, 4, 2); s2.set(stsd2, s0.length); stsd.payload = s2;
  find(stblOf(copy), "stsc").payload = withStsc(1);
  const mv = find(mm, "mvhd"), mp = mv.payload.slice(), nextId = u32(mp, mp.length - 4);
  w32(mp, mp.length - 4, nextId + 1); mv.payload = mp;
  if (getDur(mv, 16, 24) < ms) setDur(mv, 16, 24, ms);
  const ctk = find(copy, "tkhd"), tp = ctk.payload.slice(); w32(tp, tp[0] === 1 ? 20 : 12, nextId); ctk.payload = tp;
  const last = mm.children.map(c => c.type).lastIndexOf("trak");
  mm.children.splice(last + 1, 0, copy);

  const tail = new Uint8Array(8 + SILENT_STEREO.length * silent);
  w32(tail, 0, tail.length); tail.set([0x6d, 0x64, 0x61, 0x74], 4);
  for (let i = 0; i < silent; i++) tail.set(SILENT_STEREO, 8 + SILENT_STEREO.length * i);
  const free8 = new Uint8Array([0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65]);
  const fr = decoy.slice(); fr.set([0x66, 0x72, 0x65, 0x65], 4);       // moov → free
  return { pre: concat([FTYP_ISOM, fr, free8]), post: concat([tail, serialize(mm)]), layout: "rtx2" };
}

// ---------------------------------------------------------------------------
// Способ RTX Fury от 14.11.2026. Контейнер — обычная перепаковка ffmpeg (+faststart):
// [ftyp isom][moov][free 8][mdat]. Трюк внутри звука: последние 4 кадра AAC заменены кадром
// с «program config element», который объявляет раскладку из двух каналов LFE. Размеры кадров
// не меняются (остаток забит нулями). На файле RTX совпадает байт в байт.
// ---------------------------------------------------------------------------
const PCE_FRAME = hexb("a09800400128006400000350000038");   // PCE (2×LFE, 48 кГц) + два тихих LFE + конец
export const RTX3_FRAMES = 4;

function descLen(p, o) { let n = 0; for (let i = 0; i < 4; i++) { const b = p[o++]; n = (n << 7) | (b & 0x7f); if (!(b & 0x80)) break; } return [n, o]; }
// AudioSpecificConfig из stsd/mp4a/esds
function readAsc(sd) {
  let e = -1;
  for (let i = 16; i + 4 < sd.length; i++) if (sd[i] === 0x65 && sd[i + 1] === 0x73 && sd[i + 2] === 0x64 && sd[i + 3] === 0x73) { e = i + 8; break; }   // esds + версия
  if (e < 0 || sd[e] !== 3) throw new Error("звук: нет описания AAC");
  let [, o] = descLen(sd, e + 1); o += 3;                       // ES_ID, флаги
  if (sd[o] !== 4) throw new Error("звук: нет описания AAC");
  [, o] = descLen(sd, o + 1);
  if (sd[o] !== 0x40) throw new Error("звук должен быть AAC");
  o += 13;                                                       // тип, буфер, битрейты
  if (sd[o] !== 5) throw new Error("звук: нет описания AAC");
  let n; [n, o] = descLen(sd, o + 1);
  if (n < 2) throw new Error("звук: нет описания AAC");
  const b0 = sd[o], b1 = sd[o + 1];
  return { obj: b0 >> 3, sf: ((b0 & 7) << 1) | (b1 >> 7), ch: (b1 >> 3) & 15, frame960: (b1 >> 2) & 1 };
}
// Где в файле лежат последние n семплов дорожки: [{pos, len}] (pos — от начала файла)
function lastSamples(stbl, n) {
  const zs = find(stbl, "stsz").payload, uni = u32(zs, 4), cnt = u32(zs, 8);
  const size = i => uni || u32(zs, 12 + 4 * i);
  const co = find(stbl, "stco") || find(stbl, "co64"), wide = co.type === "co64", nCh = u32(co.payload, 4);
  const chunkOff = c => wide ? u64(co.payload, 8 + 8 * c) : u32(co.payload, 8 + 4 * c);
  const sc = find(stbl, "stsc").payload, ne = u32(sc, 4), per = new Array(nCh);
  for (let i = 0; i < ne; i++) {
    const first = u32(sc, 8 + 12 * i) - 1, spc = u32(sc, 12 + 12 * i), next = i + 1 < ne ? u32(sc, 8 + 12 * (i + 1)) - 1 : nCh;
    for (let c = first; c < next && c < nCh; c++) per[c] = spc;
  }
  const out = []; let s = 0;
  for (let c = 0; c < nCh; c++) {
    let pos = chunkOff(c);
    for (let k = 0; k < per[c] && s < cnt; k++, s++) { if (s >= cnt - n) out.push({ pos, len: size(s) }); pos += size(s); }
  }
  if (s !== cnt) throw new Error("звук: таблицы не сходятся");
  return out;
}

export function buildRtx3({ moov, mdatPos, mdatSize, tag = null, frames = RTX3_FRAMES }) {
  const mo = parseBoxes(moov, 0, moov.length);
  if (mo.length !== 1 || mo[0].type !== "moov") throw new Error("ожидался один блок moov");
  const m = { type: "moov", payload: null, children: parseTree(moov, mo[0].hdr, mo[0].size) };
  const traks = findAll(m, "trak");
  if (!traks.some(t => handlerType(t) === "vide")) throw new Error("нет видеодорожки");
  const aud = traks.find(t => handlerType(t) === "soun");
  if (!aud) throw new Error("нет звука");
  const st = stblOf(aud), sd = find(st, "stsd").payload;
  if (u32(sd, 4) !== 1 || cc(sd, 12) !== "mp4a") throw new Error("звук должен быть AAC");
  const asc = readAsc(sd);
  if (asc.obj !== 2 || asc.frame960 || (asc.ch !== 1 && asc.ch !== 2) || asc.sf > 12) throw new Error("звук должен быть AAC-LC, моно или стерео");
  const fill = PCE_FRAME.slice(); fill[1] = (fill[1] & 0x87) | (asc.sf << 3);        // частота в PCE

  // какие кадры заменяем: последние, в которые помещается наш кадр
  const tailS = lastSamples(st, frames * 3).filter(s => s.len >= fill.length).slice(-frames);
  if (!tailS.length) throw new Error("звук: слишком короткие кадры");
  const patches = tailS.map(s => {
    const p = s.pos - mdatPos;
    if (p < 8 || p + s.len > mdatSize) throw new Error("звук лежит вне mdat");
    return [p, s.len];
  });

  // moov как после перепаковки ffmpeg: edts у дорожек, udta с ©too в конце, moov перед mdat
  for (const t of traks) {
    if (find(t, "edts")) continue;
    const el = new Uint8Array(20); w32(el, 4, 1);
    w32(el, 8, Math.min(getDur(find(t, "tkhd"), 20, 28), 4294967295)); w32(el, 16, 0x10000);
    const tk = t.children.findIndex(c => c.type === "tkhd");
    t.children.splice(tk + 1, 0, { type: "edts", payload: null, children: [box("elst", el)] });
  }
  m.children = m.children.filter(c => c.type !== "udta" && c.type !== "meta").concat([ffUdta(tag || originalTool(moov) || FALLBACK_TOOL)]);
  const newMdat = FTYP_ISOM.length + boxSize(m) + 8;
  shiftAllOffsets(m, newMdat - mdatPos);
  const free8 = new Uint8Array([0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65]);
  return { pre: concat([FTYP_ISOM, serialize(m), free8]), patches, fill, layout: "rtx3" };
}
