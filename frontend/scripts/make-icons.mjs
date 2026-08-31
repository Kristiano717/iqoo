// Generates the PWA launcher icons in public/icons.
//
// Why a script instead of a design file: the icons need to exist as real
// PNGs for Chrome to accept the manifest and build a WebAPK (an SVG or a
// missing 512px icon means "Add to Home Screen" makes a plain bookmark
// shortcut instead of an installed app — and only installed apps show up
// in Android's floating-window switcher). No image library is installed,
// so this writes the PNG bytes directly: zlib is in Node's stdlib, and the
// mark is simple enough to describe as geometry.
//
// The output is committed (a few KB), so you only need to re-run this if
// the mark or the brand colours change:
//   node scripts/make-icons.mjs

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public/icons')

// ---------------------------------------------------------------------------
// Minimal PNG encoder: 8-bit RGBA, no interlacing, single IDAT.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(size, rgba) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0 // filter type 0 (none)
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------
// Drawing. Everything is rendered at SS× resolution and box-downsampled, which
// is what gives the rounded corners smooth edges without a rasteriser.
// ---------------------------------------------------------------------------

const SS = 4

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]

// Clamp the sample point into the rounded rect's inner box, then a plain
// distance test covers both the straight edges and the corner arcs.
function insideRoundRect(px, py, x, y, w, h, r) {
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

// Brand colours, matching the tokens in src/index.css.
const INK = hex('#12151c')
const ACCENT = hex('#f2ae4c')
const LINE_BRIGHT = hex('#cfd6e4')
const LINE_DIM = hex('#7b8397')

// Three stacked bars: two plain transcript lines and one highlighted, which is
// the whole product in one mark — raw speech in, one structured record out.
const BARS = [
  { x: 0.24, y: 0.2925, w: 0.52, h: 0.085, color: LINE_BRIGHT },
  { x: 0.24, y: 0.4575, w: 0.38, h: 0.085, color: ACCENT },
  { x: 0.24, y: 0.6225, w: 0.28, h: 0.085, color: LINE_DIM },
]

function render(size, { maskable }) {
  const big = size * SS
  const buf = new Uint8Array(big * big * 4)

  // Full-bleed for maskable (Android crops it to the launcher's own shape);
  // a rounded square with transparent corners otherwise.
  const radius = maskable ? 0 : 0.2 * big

  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const px = x + 0.5
      const py = y + 0.5
      let color = null

      if (maskable || insideRoundRect(px, py, 0, 0, big, big, radius)) {
        color = INK
        for (const bar of BARS) {
          const bx = bar.x * big
          const by = bar.y * big
          const bw = bar.w * big
          const bh = bar.h * big
          if (insideRoundRect(px, py, bx, by, bw, bh, bh / 2)) {
            color = bar.color
            break
          }
        }
      }

      const i = (y * big + x) * 4
      if (color) {
        buf[i] = color[0]
        buf[i + 1] = color[1]
        buf[i + 2] = color[2]
        buf[i + 3] = 255
      }
    }
  }

  // Box-downsample. Colour is averaged weighted by alpha so transparent
  // corner samples don't drag the edge pixels toward black.
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * big + (x * SS + sx)) * 4
          const alpha = buf[i + 3]
          r += buf[i] * alpha
          g += buf[i + 1] * alpha
          b += buf[i + 2] * alpha
          a += alpha
        }
      }
      const o = (y * size + x) * 4
      if (a > 0) {
        out[o] = Math.round(r / a)
        out[o + 1] = Math.round(g / a)
        out[o + 2] = Math.round(b / a)
      }
      out[o + 3] = Math.round(a / (SS * SS))
    }
  }
  return encodePng(size, out)
}

mkdirSync(outDir, { recursive: true })

const TARGETS = [
  // 192 and 512 "any" icons are Chrome's hard requirement for installability.
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  // Maskable keeps the mark inside the 80% safe zone so Funtouch OS can crop
  // it to its own launcher shape without clipping the bars.
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  // iOS ignores the manifest and reads this link tag instead.
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
]

for (const { file, size, maskable } of TARGETS) {
  writeFileSync(join(outDir, file), render(size, { maskable }))
  console.log(`[icons] wrote ${file} (${size}x${size})`)
}
