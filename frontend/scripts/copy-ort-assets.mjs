// Copies the onnxruntime wasm runtime out of node_modules and into
// public/ort, where the app serves it from.
//
// Why this exists rather than committing the files: they're ~40MB, and git
// keeps binaries in history forever. They're also reproducible from the
// lockfile, so they're a build artifact, not source.
//
// Why they must be served at all: @ricky0123/vad-web defaults
// onnxWASMBasePath to "./", which after Vite pre-bundling resolves inside
// .vite/deps where the wasm glue doesn't exist. useWhisperTranscript points
// it at /ort/ instead (see the comment there for why a bare path won't do).
//
// Note this reads vad-web's *nested* copy of onnxruntime-web, not the
// hoisted one — @huggingface/transformers depends on a different version,
// and mixing the two produces a runtime that fails to initialise.

import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules/@ricky0123/vad-web/node_modules/onnxruntime-web/dist')
const dest = join(root, 'public/ort')

const FILES = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
]

if (!existsSync(src)) {
  // Not fatal: the Whisper engine is optional, and the app still runs on
  // the Web Speech path without these.
  console.warn('[ort-assets] onnxruntime-web not found; skipping. On-device Whisper will not work.')
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
let copied = 0
for (const file of FILES) {
  const from = join(src, file)
  if (!existsSync(from)) {
    console.warn(`[ort-assets] missing ${file}, skipped`)
    continue
  }
  copyFileSync(from, join(dest, file))
  copied++
}
console.log(`[ort-assets] copied ${copied}/${FILES.length} files to public/ort`)
