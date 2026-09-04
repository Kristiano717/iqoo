import { useCallback, useEffect, useRef, useState } from 'react'
import { LiveTranscriber } from '../lib/liveTranscriber.js'
import { isEcho } from '../lib/echoDedupe.js'
import { fetchLiveToken } from '../api.js'

// Live transcription of both sides of a call.
//
// Two independent Gemini Live sessions rather than one mixed stream: the
// microphone and the other participant's audio stay separate all the way
// through, so every segment knows who said it. That's speaker attribution
// without a diarization model, and it's only possible because the two
// sources arrive as two streams in the first place.
//
// Returns the same shape as useSpeechTranscript (isSupported, isListening,
// finalText, interimText, error, start, stop) so LiveSession stays
// engine-agnostic, plus:
//   segments     — [{ text, speaker }] in arrival order, for display
//   micSegments  — mic-only strings, for wake-phrase scanning
//
// micSegments is separate on purpose. Wake-phrase matching dedupes by
// character offset into the joined text, which only works on one
// append-only stream; interleaving the remote speaker would shift offsets
// and re-fire old matches. It's also correct on its own terms — "Hey
// Coworker" is an instruction from the user, not something the other
// participant can trigger.

const REMOTE_MEMORY = 8 // recent remote finals kept for echo comparison

export function useLiveTranscript() {
  const [isSupported] = useState(
    () =>
      typeof window !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      !!navigator.mediaDevices?.getDisplayMedia &&
      typeof AudioWorkletNode !== 'undefined',
  )
  const [isListening, setIsListening] = useState(false)
  const [segments, setSegments] = useState([])
  const [micSegments, setMicSegments] = useState([])
  const [finalText, setFinalText] = useState('')
  const [interimText, setInterimText] = useState('')
  // Tracked separately from the microphone's. Two sessions stream interim
  // text independently, and merging them into one string makes each
  // speaker's half-finished sentence overwrite the other's.
  const [interimRemote, setInterimRemote] = useState('')
  const [error, setError] = useState(null)
  // Distinct from `error`: this means the microphone side never started, so
  // nothing at all is being captured and the caller should fall back to
  // another engine. Most errors here are partial (the other participant
  // wasn't shared) and must NOT trigger a fallback — the session is still
  // recording the user.
  const [fatalError, setFatalError] = useState(false)
  // Whether we actually got the other participant's audio. The most likely
  // failure isn't an exception — it's the user sharing a tab without ticking
  // "share tab audio", which succeeds and returns no audio track.
  const [hasRemote, setHasRemote] = useState(false)

  const micRef = useRef(null)
  const remoteRef = useRef(null)
  const streamsRef = useRef([])
  // Recent remote finals, for the echo check. A ref rather than state
  // because the callback that reads it must see the newest value without
  // being re-created on every segment.
  const recentRemoteRef = useRef([])
  const finalTextRef = useRef('')

  const appendFinal = useCallback((text, speaker) => {
    const clean = (text || '').trim()
    if (!clean) return

    if (speaker === 'them') {
      recentRemoteRef.current = [
        ...recentRemoteRef.current.slice(-(REMOTE_MEMORY - 1)),
        { text: clean, at: Date.now() },
      ]
    } else if (isEcho(clean, recentRemoteRef.current)) {
      // The other participant's voice came back in through the microphone.
      // Acoustic echo cancellation missed it; drop the copy rather than
      // attributing their words to the user. Never the reverse — the remote
      // stream is the original.
      return
    }

    setSegments((prev) => [...prev, { text: clean, speaker }])
    // Whichever side just committed, clear only that side's interim.
    if (speaker === 'them') setInterimRemote('')
    else setInterimText('')
    if (speaker === 'you') setMicSegments((prev) => [...prev, clean])

    const label = speaker === 'you' ? 'You' : 'Them'
    finalTextRef.current += `${label}: ${clean}\n`
    setFinalText(finalTextRef.current)
    setInterimText('')
  }, [])

  const stop = useCallback(() => {
    micRef.current?.stop()
    remoteRef.current?.stop()
    micRef.current = null
    remoteRef.current = null
    for (const stream of streamsRef.current) {
      for (const track of stream.getTracks()) track.stop()
    }
    streamsRef.current = []
    setIsListening(false)
    setInterimText('')
    setInterimRemote('')
  }, [])

  // Capturing the other participant is its own step so it can be retried.
  // Missing the "Also share tab audio" checkbox is the most common way a
  // real call ends up half-recorded, and making that unrecoverable would
  // mean throwing away a session that is otherwise working fine.
  const captureRemote = useCallback(async () => {
    try {
      // There's no API for "capture the meeting app", so the user shares
      // that tab and we take its audio. Video is requested only because
      // Chrome won't offer tab audio without it, and is stopped on arrival.
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })
      streamsRef.current.push(displayStream)

      for (const track of displayStream.getVideoTracks()) track.stop()

      if (displayStream.getAudioTracks().length === 0) {
        // Succeeded, but silently — this is the checkbox failure, and it
        // looks identical to success unless we check for the track.
        for (const track of displayStream.getTracks()) track.stop()
        setError(
          'That tab was shared without its audio, so only your side is being captured. ' +
            'Use "Share the meeting tab" below and tick "Also share tab audio".',
        )
        return
      }

      remoteRef.current = new LiveTranscriber({
        speaker: 'them',
        getToken: () => fetchLiveToken(),
        onInterim: (text) => setInterimRemote(text),
        onFinal: appendFinal,
        onError: (message) => setError(message),
      })
      await remoteRef.current.start(displayStream)
      setHasRemote(true)
      setError(null)
    } catch (err) {
      // Declining the prompt is a normal choice, not a failure — the session
      // carries on with the microphone alone.
      if (err?.name === 'NotAllowedError') {
        setError('Only your microphone is being captured — the other side was not shared.')
      } else {
        setError(`Could not capture the other participant: ${err?.message || err}`)
      }
    }
  }, [appendFinal])

  const start = useCallback(async () => {
    setError(null)
    setSegments([])
    setMicSegments([])
    setInterimText('')
    setInterimRemote('')
    setHasRemote(false)
    setFatalError(false)
    finalTextRef.current = ''
    setFinalText('')
    recentRemoteRef.current = []

    try {
      // Microphone. echoCancellation is the whole reason we capture this
      // ourselves instead of using the Web Speech API, which does its own
      // capture and gives no way to set constraints: on speakerphone it
      // subtracts the audio the machine is playing, which is exactly the
      // other participant's voice.
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamsRef.current.push(micStream)

      micRef.current = new LiveTranscriber({
        speaker: 'you',
        getToken: () => fetchLiveToken(),
        onInterim: (text) => setInterimText(text),
        onFinal: appendFinal,
        onError: (message) => setError(message),
      })
      await micRef.current.start(micStream)
      setIsListening(true)
    } catch (err) {
      // Nothing is being captured — the caller needs to try another engine.
      setError(`Live transcription unavailable: ${err?.message || err}`)
      setFatalError(true)
      return
    }

    await captureRemote()
  }, [appendFinal, captureRemote])

  useEffect(() => stop, [stop])

  return {
    isSupported,
    isListening,
    hasRemote,
    fatalError,
    segments,
    micSegments,
    finalText,
    interimText,
    interimRemote,
    error,
    start,
    stop,
    captureRemote,
  }
}
