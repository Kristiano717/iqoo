// Whisper transcription, off the main thread.
//
// Model load is ~40MB on first run and transcription is CPU-heavy, so both
// live here rather than in the UI thread — otherwise the live transcript
// visibly stutters every time a segment comes back.
//
// Protocol (main thread <-> worker):
//   in : { type: 'load' }                  -> out: 'ready' | 'progress' | 'error'
//   in : { type: 'transcribe', id, audio } -> out: 'result' | 'error'
//
// `audio` is a Float32Array of 16kHz mono PCM — the format the VAD emits and
// Whisper expects, so no resampling happens anywhere in this pipeline.

import { pipeline, env } from '@huggingface/transformers'

// Model weights are fetched once and cached by the browser, so later runs
// (and the demo itself) work without hitting the network again.
env.allowLocalModels = false

// tiny.en is the live-transcript model: roughly real-time on a flagship
// phone, and English-only, which is what makes the `language`/`task`
// options invalid below. Accuracy is traded for latency deliberately —
// a second, more accurate full-session pass is a roadmap item, not
// something this worker does today.
const MODEL_FAST = 'onnx-community/whisper-tiny.en'

let transcriber = null

async function load() {
  if (transcriber) return transcriber
  transcriber = await pipeline('automatic-speech-recognition', MODEL_FAST, {
    // fp32, not a quantized variant. The 'q8' build of this model ships
    // malformed dequantization scales and fails to create a session
    // ("Missing required scale: model.decoder.embed_tokens.weight..."),
    // so this trades a larger download for a model that actually loads.
    // q4 is the next thing to try if the download size becomes a problem
    // on the phone — but verify it loads before relying on it.
    dtype: 'fp32',
    progress_callback: (p) => {
      if (p.status === 'progress' && p.file?.endsWith('.onnx')) {
        self.postMessage({ type: 'progress', loaded: p.loaded, total: p.total })
      }
    },
  })
  return transcriber
}

self.onmessage = async (event) => {
  const msg = event.data

  try {
    if (msg.type === 'load') {
      await load()
      self.postMessage({ type: 'ready' })
      return
    }

    if (msg.type === 'transcribe') {
      const model = await load()
      const output = await model(msg.audio, {
        // Whisper only ever sees 30s at a time. Segments are single
        // utterances bounded by silence so they're almost always shorter
        // than that, but chunking is left on so an unusually long one gets
        // transcribed in full instead of silently truncated at 30s.
        chunk_length_s: 30,
        // No `language` or `task` here on purpose. tiny.en is English-only,
        // and transformers.js throws outright if either is passed to a
        // non-multilingual model — it has no language/task tokens to map
        // them onto, since English transcription is the only thing it does.
        // Passing them is only valid on the multilingual builds.
      })
      self.postMessage({ type: 'result', id: msg.id, text: (output.text || '').trim() })
      return
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String(err?.message || err) })
  }
}
