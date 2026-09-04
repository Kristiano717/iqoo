// Converts live audio into the exact format Gemini Live requires:
// raw 16-bit PCM, 16kHz, mono, little-endian ("audio/pcm;rate=16000").
//
// This runs on the audio rendering thread rather than the main thread. Audio
// arrives in 128-sample quanta roughly every 2.7ms, and any main-thread jank
// (a React render, a network callback) would drop quanta and put gaps in the
// transcript. A worklet can't be starved that way.
//
// Lives in public/ because AudioWorklet modules are fetched by URL, not
// bundled — see the note in vite.config.js about why files here must be
// referenced with an origin-prefixed URL rather than a bare path.

// 100ms of audio per message. Small enough that latency stays imperceptible,
// large enough that we aren't posting a message every 2.7ms.
const CHUNK_SAMPLES = 1600

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Int16Array(CHUNK_SAMPLES)
    this.count = 0
    // The caller asks for a 16kHz AudioContext, in which case this is 1 and
    // every sample passes straight through. Browsers may refuse that rate and
    // hand back 44.1/48kHz, so decimate rather than assume — sending 48kHz
    // audio labelled as 16kHz produces a transcript of chipmunk noises, which
    // is a confusing way to fail.
    this.ratio = sampleRate / 16000
    this.phase = 0
  }

  process(inputs) {
    const input = inputs[0]
    // No input connected yet, or the track ended. Staying alive (returning
    // true) means reconnecting a source doesn't need a new worklet.
    if (!input || input.length === 0 || !input[0]) return true

    const channels = input.length
    const frames = input[0].length

    for (let i = 0; i < frames; i++) {
      // Average the channels rather than taking channel 0 — tab audio is
      // often stereo with speech unevenly distributed, and dropping a channel
      // can drop a speaker.
      let sample = 0
      for (let c = 0; c < channels; c++) sample += input[c][i]
      sample /= channels

      this.phase += 1
      if (this.phase < this.ratio) continue
      this.phase -= this.ratio

      // Clamp before scaling: values outside [-1, 1] wrap around when cast to
      // int16, turning a loud moment into white noise. Asymmetric scaling
      // because int16 range is -32768..32767.
      const clamped = Math.max(-1, Math.min(1, sample))
      this.buffer[this.count++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff

      if (this.count === CHUNK_SAMPLES) {
        const chunk = new Int16Array(this.buffer)
        this.port.postMessage(chunk, [chunk.buffer])
        this.count = 0
      }
    }

    return true
  }
}

registerProcessor('pcm-worklet', PCMProcessor)
