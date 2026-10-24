// tail.js - дописывает в видеодорожку MP4 хвост из крошечных "пустых" семплов.
// Видео и звук не перекодируются: меняются только таблицы контейнера.
// Это порт patch_tail.py; результат должен совпадать с ним байт в байт.

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

// Главная функция. Возвращает { blob, info }.
function addTailChunk(input, opts = {}) {
  const pad = opts.pad ?? DEFAULT_PAD;
  const sample = opts.sample ?? DEFAULT_SAMPLE;
  const trim = opts.trim ?? true;
  const explicitStts = opts.explicitStts ?? false;
  const u = input instanceof Uint8Array ? input : new Uint8Array(input);

  const top = parseBoxes(u, 0, u.length);
  if (top.some(b => b.type === "moof")) throw new Error("фрагментированный MP4 не поддерживается");
  const mi = top.filter(b => b.type === "moov");
  if (mi.length !== 1) throw new Error("не найден блок moov");
  const { pos: mPos, size: mSize, hdr: mHdr } = mi[0];
  const mEnd = mPos + mSize;
  const moovFirst = top.some(b => b.type === "mdat" && b.pos > mPos);

  let stats = null;
  const build = (padOffset, shift) => {
    const moov = { type: "moov", payload: null, children: parseTree(u, mPos + mHdr, mEnd) };
    const trak = findAll(moov, "trak").find(t => handlerType(t) === "vide");
    if (!trak) throw new Error("нет видеодорожки");
    shiftAllOffsets(moov, shift);
    const { realTotal, framesBefore } = patchVideoTrak(trak, pad, sample, trim, explicitStts);
    appendChunkOffset(trak, padOffset);
    if (trim) setDurations(moov, trak, realTotal);
    stats = { framesBefore };
    return serialize(moov);
  };

  const padData = new Uint8Array(sample.length * pad);
  for (let i = 0; i < pad; i++) padData.set(sample, i * sample.length);
  const padBox = new Uint8Array(8 + padData.length);
  w32(padBox, 0, 8 + padData.length);
  padBox.set([0x6d, 0x64, 0x61, 0x74], 4);
  padBox.set(padData, 8);

  let parts;
  if (moovFirst) {
    const probe = build(0, 0);
    const shift = probe.length - mSize;
    const beforePad = u.length - mSize + probe.length;
    const moovBytes = build(beforePad + 8, shift);
    if (moovBytes.length !== probe.length) throw new Error("внутренняя ошибка: размер moov изменился");
    parts = [u.subarray(0, mPos), moovBytes, u.subarray(mEnd), padBox];
  } else {
    const headLen = mPos + (u.length - mEnd);
    const moovBytes = build(headLen + 8, 0);
    parts = [u.subarray(0, mPos), u.subarray(mEnd), padBox, moovBytes];
  }

  const blob = new Blob(parts, { type: "video/mp4" });
  return { blob, parts, info: { pad, frames: stats.framesBefore, moovFirst } };
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

function patchSharedTrak(trak, pad, sampleLen, trim, sampleOffset) {
  const stbl = stblOf(trak);

  const stsz = find(stbl, "stsz");
  const uniform = u32(stsz.payload, 4), count = u32(stsz.payload, 8), total = count + pad;
  const nz = new Uint8Array(12 + 4 * total);
  w32(nz, 8, total);
  for (let i = 0; i < count; i++) w32(nz, 12 + 4 * i, uniform || u32(stsz.payload, 12 + 4 * i));
  for (let i = 0; i < pad; i++) w32(nz, 12 + 4 * (count + i), sampleLen);
  stsz.payload = nz;

  const stts = find(stbl, "stts");
  const entries = readStts(stts.payload);
  if (trim && entries.length) {
    const last = entries[entries.length - 1];
    if (last[0] === 1) entries[entries.length - 1] = [1, 1];
    else { entries[entries.length - 1] = [last[0] - 1, last[1]]; entries.push([1, 1]); }
  }
  const realTotal = entries.reduce((s, [c, d]) => s + c * d, 0);
  const merged = [];
  for (const [c, d] of entries) {
    if (merged.length && merged[merged.length - 1][1] === d) merged[merged.length - 1][0] += c;
    else merged.push([c, d]);
  }
  stts.payload = writeStts(merged);

  const stco = find(stbl, "stco"), co64 = find(stbl, "co64");
  const nChunks = u32((stco || co64).payload, 4);

  const stsc = find(stbl, "stsc");
  const sp = stsc.payload, sn = u32(sp, 4);
  const so = new Uint8Array(sp.length + 12);
  so.set(sp, 0);
  w32(so, 4, sn + 1);
  w32(so, sp.length, nChunks + 1);
  w32(so, sp.length + 4, 1);
  w32(so, sp.length + 8, 1);
  stsc.payload = so;

  if (stco) {
    if (sampleOffset >= 4294967296) throw new Error("смещение больше 4 ГБ, нужен co64");
    const p = stco.payload, out = new Uint8Array(p.length + 4 * pad);
    out.set(p, 0);
    w32(out, 4, nChunks + pad);
    for (let i = 0; i < pad; i++) w32(out, p.length + 4 * i, sampleOffset);
    stco.payload = out;
  } else {
    const p = co64.payload, out = new Uint8Array(p.length + 8 * pad);
    out.set(p, 0);
    w32(out, 4, nChunks + pad);
    const dv = new DataView(out.buffer);
    for (let i = 0; i < pad; i++) dv.setBigUint64(p.length + 8 * i, BigInt(sampleOffset));
    co64.payload = out;
  }
  return { realTotal, framesBefore: count };
}

function addTailShared(input, opts) {
  const pad = opts.pad ?? DEFAULT_PAD;
  const sample = opts.sample ?? DEFAULT_SAMPLE;
  const trim = opts.trim ?? true;
  const brands = opts.brands ?? true;
  const u = input instanceof Uint8Array ? input : new Uint8Array(input);

  const top = parseBoxes(u, 0, u.length);
  if (top.some(b => b.type === "moof")) throw new Error("фрагментированный MP4 не поддерживается");
  const mi = top.filter(b => b.type === "moov");
  const md = top.filter(b => b.type === "mdat");
  if (mi.length !== 1) throw new Error("не найден блок moov");
  if (md.length !== 1) return null;                      // нестандартный файл: пусть работает старая раскладка
  const M = md[0], mo = mi[0];
  const ft = top[0].type === "ftyp" ? top[0] : null;
  const ftypDelta = brands && ft ? FTYP_ISOM.length - ft.size : 0;
  const moovBefore = mo.pos < M.pos;

  const build = (sampleOffset, shift) => {
    const moov = { type: "moov", payload: null, children: parseTree(u, mo.pos + mo.hdr, mo.pos + mo.size) };
    const trak = findAll(moov, "trak").find(t => handlerType(t) === "vide");
    if (!trak) throw new Error("нет видеодорожки");
    shiftAllOffsets(moov, shift);
    const { realTotal, framesBefore } = patchSharedTrak(trak, pad, sample.length, trim, sampleOffset);
    if (trim) setDurations(moov, trak, realTotal);
    return { bytes: serialize(moov), framesBefore };
  };

  const probe = build(0, 0).bytes;
  const moovDelta = probe.length - mo.size;
  const shift = ftypDelta + (moovBefore ? moovDelta : 0);
  const sampleOffset = M.pos + M.size + shift;
  const { bytes: moovBytes, framesBefore } = build(sampleOffset, shift);
  if (moovBytes.length !== probe.length) throw new Error("внутренняя ошибка: размер moov изменился");

  const newSize = M.size + sample.length;
  let mdatHead;
  if (M.hdr === 16) { mdatHead = new Uint8Array(16); mdatHead.set(u.subarray(M.pos, M.pos + 16)); new DataView(mdatHead.buffer).setBigUint64(8, BigInt(newSize)); }
  else {
    if (newSize >= 4294967296) throw new Error("mdat больше 4 ГБ не поддерживается");
    mdatHead = new Uint8Array(8); mdatHead.set(u.subarray(M.pos, M.pos + 8)); w32(mdatHead, 0, newSize);
  }

  const parts = [];
  for (const b of top) {
    if (b === ft && brands) parts.push(FTYP_ISOM);
    else if (b === mo) parts.push(moovBytes);
    else if (b === M) { parts.push(mdatHead, u.subarray(M.pos + M.hdr, M.pos + M.size), sample); }
    else parts.push(u.subarray(b.pos, b.pos + b.size));
  }
  return { blob: new Blob(parts, { type: "video/mp4" }), parts, info: { pad, frames: framesBefore, moovFirst: moovBefore, layout: "shared" } };
}

// ---------------------------------------------------------------------------
// Раскладка "audio" (как у RTX Fury v21, проверено на их файле байт в байт):
//  - видео и звук не трогаются;
//  - добавляется третья дорожка: копия звуковой + mult×(число семплов звука) пустых семплов
//    по 8 байт длиной 1 тик, они лежат одним чанком сразу после mdat (без заголовка блока),
//    а в самом конце файла 8-байтовый блок free;
//  - mvhd версии 1 с длительностью 0xFFFF_FFFF_FFFF_FFFF;
//  - в hdlr у дорожек убираются 4 из 12 зарезервированных байт;
//  - moov в начале файла, метка в udta видеодорожки.
// ---------------------------------------------------------------------------
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

export function addTailAudio(input, opts = {}) {
  const mult = opts.mult ?? 9;
  const tag = opts.tag ?? "clip4k.app";
  const u = input instanceof Uint8Array ? input : new Uint8Array(input);
  const top = parseBoxes(u, 0, u.length);
  if (top.some(b => b.type === "moof")) throw new Error("фрагментированный MP4 не поддерживается");
  const mo = top.filter(b => b.type === "moov"), md = top.filter(b => b.type === "mdat");
  if (mo.length !== 1 || md.length !== 1) return null;
  const ft = top[0].type === "ftyp" ? top[0] : null;
  const M = md[0];

  const build = (shift, tailOff) => {
    const moov = { type: "moov", payload: null, children: parseTree(u, mo[0].pos + mo[0].hdr, mo[0].pos + mo[0].size) };
    const traks = findAll(moov, "trak");
    const vid = traks.find(t => handlerType(t) === "vide");
    const aud = traks.find(t => handlerType(t) === "soun");
    if (!vid || !aud) return null;
    shiftAllOffsets(moov, shift);
    for (const t of traks) trimHdlr(t);
    // копия звуковой дорожки (без edts и udta)
    const copy = { type: "trak", payload: null, children: parseTree(serialize(aud), 8, serialize(aud).length) };
    copy.children = copy.children.filter(c => c.type !== "edts" && c.type !== "udta");
    // mvhd → версия 1, длительность «бесконечность», next_track_ID + 1
    const mvhd = find(moov, "mvhd"), p = mvhd.payload;
    const v1 = p[0] === 1;
    const ts = u32(p, v1 ? 20 : 12), rest = p.subarray(v1 ? 32 : 20);
    const nextId = u32(rest, rest.length - 4);
    const nv = new Uint8Array(32 + rest.length);
    nv[0] = 1; w32(nv, 20, ts);
    for (let i = 24; i < 32; i++) nv[i] = 255;
    nv.set(rest, 32); w32(nv, nv.length - 4, nextId + 1);
    mvhd.payload = nv;
    // новая дорожка: id, хвост в таблицах
    const tk = find(copy, "tkhd"), tp = tk.payload.slice();
    w32(tp, tp[0] === 1 ? 20 : 12, nextId); tk.payload = tp;
    const stbl = stblOf(copy);
    const stsz = find(stbl, "stsz"), uni = u32(stsz.payload, 4), cnt = u32(stsz.payload, 8), pad = cnt * mult;
    const nz = new Uint8Array(12 + 4 * (cnt + pad)); w32(nz, 8, cnt + pad);
    for (let i = 0; i < cnt; i++) w32(nz, 12 + 4 * i, uni || u32(stsz.payload, 12 + 4 * i));
    for (let i = 0; i < pad; i++) w32(nz, 12 + 4 * (cnt + i), 8);
    stsz.payload = nz;
    const stts = find(stbl, "stts"), e = readStts(stts.payload); e.push([pad, 1]); stts.payload = writeStts(e);
    const co = find(stbl, "stco") || find(stbl, "co64"), nCh = u32(co.payload, 4);
    const stsc = find(stbl, "stsc"), sp = stsc.payload, so = new Uint8Array(sp.length + 12);
    so.set(sp); w32(so, 4, u32(sp, 4) + 1); w32(so, sp.length, nCh + 1); w32(so, sp.length + 4, pad); w32(so, sp.length + 8, 1);
    stsc.payload = so;
    appendChunkOffset(copy, tailOff);
    // метка у видео, верхний udta убираем
    vid.children = vid.children.filter(c => c.type !== "udta").concat([toolTag(tag)]);
    moov.children = moov.children.filter(c => c.type !== "udta").concat([copy]);
    return { bytes: serialize(moov), pad };
  };

  const ftyp = ft ? u.subarray(ft.pos, ft.pos + ft.size) : new Uint8Array(0);
  const probe = build(0, 0);
  if (!probe) return null;
  const newMdat = ftyp.length + probe.bytes.length;
  const shift = newMdat - M.pos;
  const fin = build(shift, newMdat + M.size);
  if (fin.bytes.length !== probe.bytes.length) throw new Error("внутренняя ошибка: размер moov изменился");
  const tail = new Uint8Array(8 * fin.pad + 8);
  for (let i = 0; i < fin.pad; i++) tail[8 * i + 3] = 4;                   // 00000004 00000000
  tail.set([0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65], 8 * fin.pad);            // в конце блок free (8 байт)
  const parts = [ftyp, fin.bytes, u.subarray(M.pos, M.pos + M.size), tail];
  return { blob: new Blob(parts, { type: "video/mp4" }), parts, info: { pad: fin.pad, layout: "audio" } };
}

// Главная функция. layout: "audio" (как RTX Fury), "shared" (как Zilem) или "chunk" (как Termux-скрипты).
export function addTail(input, opts = {}) {
  if ((opts.layout ?? "audio") === "audio") {
    const r = addTailAudio(input, opts);
    if (r) return r;
  }
  if (opts.layout === "shared") {
    const r = addTailShared(input, opts);
    if (r) return r;
  }
  const r = addTailChunk(input, opts);
  r.info.layout = "chunk";
  return r;
}
