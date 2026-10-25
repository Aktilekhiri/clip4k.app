// src/tail.js — серверная часть: добавление хвоста по одному лишь «оглавлению» файла.
// Клиент присылает ftyp и moov и сообщает, где лежит mdat. Сервер возвращает новый moov,
// а клиент собирает файл: ftyp + moov' + исходный mdat + хвост.
// Логика совпадает с прежним public/tail.js (проверено байт в байт на файле RTX Fury).

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
export function buildHead({ ftyp, moov, mdatPos, mdatSize, layout = "audio", pad: padOpt, tag = "clip4k.app", mult = 9 }) {
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
    vid.children = vid.children.filter(c => c.type !== "udta").concat([toolTag(tag)]);
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
