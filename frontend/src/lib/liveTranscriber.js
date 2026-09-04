// One audio source, transcribed live by Gemini.
//
// Owns an audio graph (MediaStream -> worklet -> 16kHz PCM16) and a Gemini
// Live WebSocket, and turns them into interim/final text callbacks. A call
// runs two of these: one on the microphone, one on the other participant's
// audio. Kept as a plain class rather than a hook so the reconnect logic
// below isn't tangled up in React's lifecycle.

import { GoogleGenAI } from '@google/genai'
import { overlap } from './echoDedupe.js'

const TARGET_SAMPLE_RATE = 16000
const MIME_TYPE = `audio/pcm;rate=${TARGET_SAMPLE_RATE}`

// After switching to a replacement socket, keep the old one alive briefly and
// keep emitting from it. A sentence already in flight when the handover
// starts would otherwise be cut off — the old session is the only one holding
// its beginning.
const HANDOVER_GRACE_MS = 2500

/** Int16Array -> base64, which is how the Live API wants audio. */
function toBase64(int16) {
  const bytes = new Uint8Array(int16.buffer)
  let binary = ''
  // Chunked because String.fromCharCode.apply blows the argument limit on
  // large arrays — at 100ms per message this is small, but the limit is a
  // cliff rather than a slope, so don't rely on staying under it.
  const STRIDE = 0x8000
  for (let i = 0; i < bytes.length; i += STRIDE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + STRIDE))
  }
  return btoa(binary)
}

export class LiveTranscriber {
  /**
   * @param {object}   opts
   * @param {string}   opts.speaker    'you' | 'them', attached to every segment
   * @param {Function} opts.getToken   async () => ({ token, model })
   * @param {Function} opts.onInterim  (text, speaker) => void
   * @param {Function} opts.onFinal    (text, speaker) => void
   * @param {Function} opts.onError    (message) => void
   */
  constructor({ speaker, getToken, onInterim, onFinal, onError }) {
    this.speaker = speaker
    this.getToken = getToken
    this.onInterim = onInterim
    this.onFinal = onFinal
    this.onError = onError

    this.audioContext = null
    this.workletNode = null
    this.sourceNode = null
    this.silentGain = null

    this.active = null // the session whose transcripts we emit
    this.previous = null // kept briefly during a handover
    this.resumeHandle = null
    this.recentFinals = [] // for suppressing duplicates across a handover
    this.stopped = false
  }

  async start(mediaStream) {
    this.stopped = false
    await this._buildAudioGraph(mediaStream)
    this.active = await this._openSession()
  }

  stop() {
    this.stopped = true
    for (const session of [this.active, this.previous]) {
      try {
        session?.handle?.close()
      } catch {
        // Already closed, or closing during teardown — nothing to salvage.
      }
    }
    this.active = null
    this.previous = null

    try {
      this.workletNode?.port?.close()
      this.workletNode?.disconnect()
      this.sourceNode?.disconnect()
      this.silentGain?.disconnect()
      this.audioContext?.close()
    } catch {
      // Teardown races the graph shutting itself down; not actionable.
    }
    this.audioContext = null
  }

  async _buildAudioGraph(mediaStream) {
    // Ask for a 16kHz context so the browser resamples for us. If it refuses
    // (some devices only allow the hardware rate) the worklet decimates
    // instead, so this is an optimisation rather than a requirement.
    try {
      this.audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
    } catch {
      this.audioContext = new AudioContext()
    }

    await this.audioContext.audioWorklet.addModule(
      // Origin-prefixed on purpose: files in public/ can't be imported from
      // source, and a bare '/pcm-worklet.js' gets intercepted by Vite's
      // import analysis. See the same note in vite.config.js.
      `${window.location.origin}/pcm-worklet.js`,
    )

    this.sourceNode = this.audioContext.createMediaStreamSource(mediaStream)
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-worklet')

    // A worklet only runs while the graph is being pulled toward the
    // destination — but routing microphone audio to the speakers would create
    // an ear-splitting feedback loop. A muted gain node keeps the graph alive
    // while guaranteeing nothing is audible.
    this.silentGain = this.audioContext.createGain()
    this.silentGain.gain.value = 0

    this.sourceNode.connect(this.workletNode)
    this.workletNode.connect(this.silentGain)
    this.silentGain.connect(this.audioContext.destination)

    this.workletNode.port.onmessage = (event) => this._sendAudio(event.data)
  }

  _sendAudio(int16) {
    if (this.stopped) return
    const payload = { audio: { data: toBase64(int16), mimeType: MIME_TYPE } }
    // Fed to both sockets during a handover so the replacement has heard the
    // audio leading up to the switch, and doesn't start mid-sentence.
    for (const session of [this.active, this.previous]) {
      if (!session?.open) continue
      try {
        session.handle.sendRealtimeInput(payload)
      } catch {
        // A socket dying mid-send is handled by its own onclose.
      }
    }
  }

  async _openSession(resumeHandle = null) {
    const { token, model } = await this.getToken()
    const client = new GoogleGenAI({ apiKey: token })

    const session = { handle: null, open: false }

    session.handle = await client.live.connect({
      model,
      config: {
        responseModalities: ['TEXT'],
        // Empty list means automatic language detection.
        inputAudioTranscription: { languageCodes: [] },
        // Lets a replacement socket pick up where this one left off instead
        // of starting cold. `transparent` makes the server report how much of
        // our input it consumed, which is what makes a seamless swap possible.
        sessionResumption: resumeHandle
          ? { handle: resumeHandle, transparent: true }
          : { transparent: true },
      },
      callbacks: {
        onopen: () => {
          session.open = true
        },
        onmessage: (message) => this._onMessage(session, message),
        onerror: (event) => {
          if (this.stopped) return
          this.onError?.(event?.message || 'Live transcription connection error')
        },
        onclose: () => {
          session.open = false
          this._onClose(session)
        },
      },
    })

    return session
  }

  _onMessage(session, message) {
    if (this.stopped) return

    // Save the newest resumption handle regardless of which socket sent it —
    // it's what a replacement uses to continue rather than restart.
    const update = message?.sessionResumptionUpdate
    if (update?.resumable && update.newHandle) this.resumeHandle = update.newHandle

    // The server warns before it closes a session (they cap at ~10 minutes).
    // Reacting to this beats a client-side timer: the server knows the real
    // deadline, and it moves.
    if (message?.goAway) this._beginHandover()

    const content = message?.serverContent
    if (!content) return

    // Only the active socket drives the UI. A warming replacement is hearing
    // the same audio, and emitting from both would duplicate every word.
    if (session !== this.active && session !== this.previous) return

    const interim = content.interimInputTranscription?.text
    if (interim && session === this.active) {
      this.onInterim?.(interim, this.speaker)
    }

    const final = content.inputTranscription?.text?.trim()
    if (!final) return

    // During a handover both sockets can commit overlapping audio. Suppress a
    // final that repeats one just emitted — scoped to the handover window, so
    // genuine repetition in normal conversation is never touched.
    if (this.previous && this._isRecentDuplicate(final)) return

    this.recentFinals.push(final)
    if (this.recentFinals.length > 5) this.recentFinals.shift()
    this.onFinal?.(final, this.speaker)
  }

  _isRecentDuplicate(text) {
    return this.recentFinals.some((seen) => {
      const { dice, containment } = overlap(text, seen)
      return dice >= 0.8 || containment >= 0.95
    })
  }

  async _onClose(session) {
    if (this.stopped) return
    // An expected close during handover: the old socket finishing its grace.
    if (session === this.previous) {
      this.previous = null
      return
    }
    // The active socket dropped without a goAway — network blip, or the
    // session expired faster than advertised. Rebuild from the handle.
    if (session === this.active) {
      try {
        this.active = await this._openSession(this.resumeHandle)
      } catch (err) {
        this.onError?.(`Lost the transcription connection: ${err?.message || err}`)
      }
    }
  }

  async _beginHandover() {
    if (this.stopped || this.previous) return // already handing over
    const dying = this.active
    try {
      const replacement = await this._openSession(this.resumeHandle)
      this.previous = dying
      this.active = replacement

      // Let the outgoing socket finish whatever sentence it was holding,
      // then close it. Its audio feed continues until then (see _sendAudio).
      setTimeout(() => {
        if (this.previous === dying) {
          try {
            dying.handle.close()
          } catch {
            // Already gone.
          }
          this.previous = null
        }
      }, HANDOVER_GRACE_MS)
    } catch (err) {
      // Couldn't open a replacement — leave the current one running until it
      // closes on its own, at which point _onClose retries.
      this.onError?.(`Could not renew the transcription session: ${err?.message || err}`)
    }
  }
}
