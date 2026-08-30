import { useCallback, useEffect, useRef, useState } from 'react'

// vad-web is imported lazily, inside start(), on purpose. It pulls in
// onnxruntime, and a failure anywhere in that chain used to throw at module
// load — which blanked the entire app, including the Web Speech path that
// has nothing to do with it. An experimental engine should only be able to
// break itself, so the cost of loading it is deferred until it's actually
// selected and started.
let micVadModule = null
async function loadMicVAD() {
  if (!micVadModule) micVadModule = await import('@ricky0123/vad-web')
  return micVadModule.MicVAD
}

// On-device transcription: Silero VAD finds utterance boundaries, Whisper
// transcribes each one in a worker. Drop-in replacement for
// useSpeechTranscript — same return shape, so LiveSession doesn't know or
// care which engine is running.
//
// Why VAD-then-batch instead of streaming: Whisper processes fixed 30s
// windows internally, so naively re-transcribing a growing buffer redoes
// the whole window every tick and runs ~5x slower than real time. Batching
// one utterance at a time keeps each segment cheap and gives ~2s latency
// after a pause.
//
// The tradeoff versus Web Speech is no interim text — nothing appears mid
// sentence, because there's nothing to show until the segment closes.
// LiveSession renders an audio level meter during speech to cover that.

// Cap on how long a single utterance can run before we cut it ourselves.
// Latency scales with segment length, so without this a speaker who never
// pauses makes the app look frozen.
const MAX_SEGMENT_MS = 9000

// `enabled` gates the worker: useTranscript mounts both engines to keep hook
// order stable, so without this the Whisper worker (and the ~500kB of
// Transformers.js inside it) would spin up on every page load even when the
// Web Speech engine is the one selected.
export function useWhisperTranscript(enabled = true) {
  const [isListening, setIsListening] = useState(false)
  const [finalText, setFinalText] = useState('')
  const [finalSegments, setFinalSegments] = useState([])
  const [error, setError] = useState(null)
  // Model has to download and warm up before the first utterance can be
  // transcribed (fp32 tiny.en, so on the order of a hundred-odd MB — see
  // whisperWorker.js for why it isn't quantized). Surfaced so the UI can
  // say so rather than looking broken on first run.
  const [modelState, setModelState] = useState('idle') // idle | loading | ready | error
  const [loadProgress, setLoadProgress] = useState(0)
  // 0..1 mic level, for the "still listening" affordance that replaces
  // Web Speech's interim text.
  const [level, setLevel] = useState(0)

  const workerRef = useRef(null)
  const vadRef = useRef(null)
  const finalTextRef = useRef('')
  const nextIdRef = useRef(0)
  // Transcriptions resolve out of order if one segment is slower than the
  // next; this keeps them in the order they were spoken.
  const pendingRef = useRef([])

  useEffect(() => {
    if (!enabled) return

    const worker = new Worker(new URL('../workers/whisperWorker.js', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    worker.onmessage = (event) => {
      const msg = event.data

      if (msg.type === 'progress') {
        if (msg.total) setLoadProgress(msg.loaded / msg.total)
        return
      }
      if (msg.type === 'ready') {
        setModelState('ready')
        return
      }
      if (msg.type === 'error') {
        setError(msg.message)
        setModelState((s) => (s === 'loading' ? 'error' : s))
        // Drop the failed segment so it can't block everything behind it.
        pendingRef.current = pendingRef.current.filter((p) => p.id !== msg.id)
        flushPending()
        return
      }
      if (msg.type === 'result') {
        const entry = pendingRef.current.find((p) => p.id === msg.id)
        if (entry) {
          entry.text = msg.text
          entry.done = true
        }
        flushPending()
      }
    }

    setModelState('loading')
    worker.postMessage({ type: 'load' })

    return () => {
      worker.terminate()
      workerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  // Append completed segments in spoken order, stopping at the first one
  // still in flight so nothing jumps ahead of it.
  const flushPending = useCallback(() => {
    const ready = []
    while (pendingRef.current.length > 0 && pendingRef.current[0].done) {
      const entry = pendingRef.current.shift()
      if (entry.text) ready.push(entry.text)
    }
    if (ready.length === 0) return

    finalTextRef.current = finalTextRef.current + ready.join(' ') + ' '
    setFinalText(finalTextRef.current)
    setFinalSegments((prev) => [...prev, ...ready])
  }, [])

  const handleSpeechEnd = useCallback((audio) => {
    const worker = workerRef.current
    if (!worker) return
    const id = nextIdRef.current++
    pendingRef.current.push({ id, text: '', done: false })
    worker.postMessage({ type: 'transcribe', id, audio }, [audio.buffer])
  }, [])

  const start = useCallback(async () => {
    setError(null)
    finalTextRef.current = ''
    setFinalText('')
    setFinalSegments([])
    pendingRef.current = []
    nextIdRef.current = 0

    try {
      const MicVAD = await loadMicVAD()
      const vad = await MicVAD.new({
        onSpeechEnd: handleSpeechEnd,
        onFrameProcessed: (probs) => setLevel(probs.isSpeech ?? 0),
        // Silero defaults are tuned for conversation; these bias slightly
        // toward closing a segment sooner so a captured task appears fast.
        redemptionFrames: 12,
        preSpeechPadFrames: 3,
        minSpeechFrames: 4,
        // Both paths point at files vendored into public/ (see public/vad
        // and public/ort), so transcription never depends on a CDN.
        //
        // These MUST be absolute URLs built at runtime, not bare paths.
        // vad-web defaults onnxWASMBasePath to './', which resolves
        // relative to its own location — after Vite pre-bundling that's
        // .vite/deps/, where the wasm glue doesn't exist ("no available
        // backend found. ERR: [wasm]"). A bare '/ort/' doesn't work either:
        // Vite's import analysis intercepts it and refuses, because files
        // in public/ can't be imported from source. A full origin-prefixed
        // URL is treated as external, so it passes through untouched.
        baseAssetPath: `${window.location.origin}/vad/`,
        onnxWASMBasePath: `${window.location.origin}/ort/`,
      })
      vadRef.current = vad
      vad.start()
      setIsListening(true)
    } catch (err) {
      setError(`Microphone unavailable: ${err?.message || err}`)
      setIsListening(false)
    }
  }, [handleSpeechEnd])

  const stop = useCallback(() => {
    const vad = vadRef.current
    if (vad) {
      vad.pause()
      vadRef.current = null
    }
    setIsListening(false)
    setLevel(0)
  }, [])

  useEffect(() => () => vadRef.current?.pause(), [])

  return {
    // Matches useSpeechTranscript's shape. `interimText` is always empty:
    // this engine has no partial results by design.
    isSupported: true,
    isListening,
    finalText,
    finalSegments,
    interimText: '',
    error,
    start,
    stop,
    // Whisper-only extras; LiveSession renders these when present.
    modelState,
    loadProgress,
    level,
    maxSegmentMs: MAX_SEGMENT_MS,
  }
}
