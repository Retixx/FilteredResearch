// Renders the FilteredResearch book mark to PNG directly, with no browser and
// no base64 transfer. An earlier round produced a CRC-corrupt icon-48.png,
// which made Chrome fall back to a grey placeholder, so this writes the bytes
// locally and verifies every file it emits.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SS = 4; // supersampling factor, for antialiasing

const INK = [17, 19, 17, 255];
const PAPER = [251, 252, 251, 255];
const OPAL = [166, 210, 202, 255];
const OPAL_DARK = [71, 124, 115, 255];
const PAGES = [230, 239, 237, 255];
const CLEAR = [0, 0, 0, 0];

function canvas(size) {
  return { size, data: new Uint8ClampedArray(size * size * 4) };
}

function put(img, x, y, colour) {
  if (x < 0 || y < 0 || x >= img.size || y >= img.size) return;
  const i = (y * img.size + x) * 4;
  const [r, g, b, a] = colour;
  if (a === 0) return;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = a;
}

function insideRoundedRect(px, py, x, y, w, h, r) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function fillRoundedRect(img, x, y, w, h, r, colour) {
  for (let py = Math.floor(y); py <= Math.ceil(y + h); py += 1) {
    for (let px = Math.floor(x); px <= Math.ceil(x + w); px += 1) {
      if (insideRoundedRect(px + 0.5, py + 0.5, x, y, w, h, r)) put(img, px, py, colour);
    }
  }
}

function strokeRoundedRect(img, x, y, w, h, r, thickness, colour) {
  const t = thickness;
  for (let py = Math.floor(y - t); py <= Math.ceil(y + h + t); py += 1) {
    for (let px = Math.floor(x - t); px <= Math.ceil(x + w + t); px += 1) {
      const outside = insideRoundedRect(px + 0.5, py + 0.5, x - t / 2, y - t / 2, w + t, h + t, r + t / 2);
      const inside = insideRoundedRect(px + 0.5, py + 0.5, x + t / 2, y + t / 2, w - t, h - t, Math.max(0, r - t / 2));
      if (outside && !inside) put(img, px, py, colour);
    }
  }
}

function fillRect(img, x, y, w, h, colour) {
  for (let py = Math.floor(y); py < Math.ceil(y + h); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + w); px += 1) put(img, px, py, colour);
  }
}

// Diagonal bar, used for the leg of the R.
function fillQuad(img, ax, ay, bx, by, thickness, colour) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len * 2);
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const cx = ax + dx * t;
    const cy = ay + dy * t;
    fillRect(img, cx - thickness / 2, cy - thickness / 2, thickness, thickness, colour);
  }
}

function drawMark(img, unit) {
  const u = (value) => value * unit;
  // Back cover, page block and front cover, each offset to give the stack depth.
  fillRoundedRect(img, u(176), u(206), u(716), u(700), u(76), OPAL_DARK);
  strokeRoundedRect(img, u(176), u(206), u(716), u(700), u(76), u(26), INK);
  fillRoundedRect(img, u(150), u(176), u(716), u(700), u(76), PAGES);
  strokeRoundedRect(img, u(150), u(176), u(716), u(700), u(76), u(26), INK);
  fillRoundedRect(img, u(124), u(146), u(716), u(700), u(76), PAPER);
  strokeRoundedRect(img, u(124), u(146), u(716), u(700), u(76), u(26), INK);

  // Spine fold and its binding bands.
  fillRect(img, u(226), u(180), u(20), u(632), OPAL_DARK);
  fillRect(img, u(150), u(300), u(84), u(18), INK);
  fillRect(img, u(150), u(676), u(84), u(18), INK);

  // Opal panel behind the monogram.
  fillRoundedRect(img, u(300), u(238), u(486), u(516), u(44), OPAL);

  // F
  const bar = u(52);
  fillRect(img, u(372), u(340), bar, u(320), INK);
  fillRect(img, u(372), u(340), u(150), bar, INK);
  fillRect(img, u(372), u(474), u(122), bar, INK);

  // R: stem, bowl (top bar, right side, waist) and diagonal leg.
  fillRect(img, u(586), u(340), bar, u(320), INK);
  fillRect(img, u(586), u(340), u(132), bar, INK);
  fillRect(img, u(666), u(340), bar, u(160), INK);
  fillRect(img, u(586), u(448), u(132), bar, INK);
  fillQuad(img, u(660), u(500), u(742), u(660), bar, INK);
}

function downsample(hi, size) {
  const out = canvas(size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const i = ((y * SS + sy) * hi.size + (x * SS + sx)) * 4;
          const alpha = hi.data[i + 3] / 255;
          r += hi.data[i] * alpha;
          g += hi.data[i + 1] * alpha;
          b += hi.data[i + 2] * alpha;
          a += alpha;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      out.data[i] = a ? r / a : 0;
      out.data[i + 1] = a ? g / a : 0;
      out.data[i + 2] = a ? b / a : 0;
      out.data[i + 3] = (a / n) * 255;
    }
  }
  return out;
}

function crc32(buffer) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(img) {
  const raw = Buffer.alloc((img.size * 4 + 1) * img.size);
  let offset = 0;
  for (let y = 0; y < img.size; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < img.size; x += 1) {
      const i = (y * img.size + x) * 4;
      raw[offset] = img.data[i];
      raw[offset + 1] = img.data[i + 1];
      raw[offset + 2] = img.data[i + 2];
      raw[offset + 3] = img.data[i + 3];
      offset += 4;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.size, 0);
  ihdr.writeUInt32BE(img.size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function verify(bytes) {
  if (bytes.length < 8) return "too short";
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i += 1) if (bytes[i] !== sig[i]) return "bad signature";
  let i = 8;
  const seen = [];
  while (i < bytes.length) {
    const length = bytes.readUInt32BE(i);
    const type = bytes.slice(i + 4, i + 8).toString("ascii");
    const body = bytes.slice(i + 4, i + 8 + length);
    const stored = bytes.readUInt32BE(i + 8 + length);
    if (crc32(body) !== stored) return `CRC mismatch in ${type}`;
    seen.push(type);
    i += 12 + length;
  }
  if (seen[0] !== "IHDR" || seen.at(-1) !== "IEND") return `unexpected chunks: ${seen.join(",")}`;
  return null;
}

const root = resolve(import.meta.dirname, "..");
for (const size of [16, 32, 48, 128]) {
  const hi = canvas(size * SS);
  drawMark(hi, (size * SS) / 1024);
  const png = encodePng(downsample(hi, size));
  const problem = verify(png);
  if (problem) {
    process.stderr.write(`icon-${size}.png FAILED: ${problem}\n`);
    process.exit(1);
  }
  const path = resolve(root, "assets", `icon-${size}.png`);
  writeFileSync(path, png);
  process.stdout.write(`icon-${size}.png  ${String(png.length).padStart(5)} bytes  verified\n`);
}
