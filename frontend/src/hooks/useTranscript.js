import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveTranscript } from './useLiveTranscript.js'
import { useSpeechTranscript } from './useSpeechTranscript.js'

// Picks the transcription engine, and falls back if the primary can't run.
//
// Primary is Gemini Live, which captures both sides of a call. Fallback is
// the browser's Web Speech API, which only hears the microphone but needs no
// network service of ours and no quota. The fallback exists because the
// primary has a failure mode we don't control — a rate limit, an outage, an
// expired key — and losing half a meeting's record is bad, but losing all of
// it because a token request failed is worse.
//
// Both hooks are called unconditionally: React requires a stable hook order,
// so the inactive engine still mounts. Neither touches the microphone until
// its start() is called.

/** Normalises Web Speech's shape onto the richer live-engine shape. */
function asFallback(speech) {
  return {
    isSupported: speech.isSupported,
    isListening: speech.isListening,
    // Web Speech can only ever hear the microphone.
    hasRemote: false,
    segments: speech.finalSegments.map((text) => ({ text, speaker: 'you' })),
    micSegments: speech.finalSegments,
    finalText: speech.finalText,
    interimText: speech.interimText,
    // Web Speech only ever hears the microphone.
    interimRemote: '',
    error: speech.error,
    start: speech.start,
    stop: speech.stop,
    // Web Speech can't take a shared stream, so there's nothing to retry.
    captureRemote: null,
  }
}

export function useTranscript() {
  const live = useLiveTranscript()
  const speech = useSpeechTranscript()
  const [usingFallback, setUsingFallback] = useState(false)
  const switchedRef = useRef(false)

  useEffect(() => {
    // Only a fatal error switches engines. A partial failure — the user
    // declining to share the other participant's tab, say — still leaves the
    // microphone recording through the live engine, and swapping it out for a
    // weaker one would make things worse, not better.
    if (!live.fatalError || switchedRef.current) return
    switchedRef.current = true
    setUsingFallback(true)
    if (speech.isSupported) speech.start()
  }, [live.fatalError, speech])

  const fallback = useMemo(() => asFallback(speech), [speech])

  if (!usingFallback) return { ...live, mode: 'live' }

  return {
    ...fallback,
    mode: 'fallback',
    // Keep the reason visible: the user should know why only their own voice
    // is being captured, rather than assuming the other side simply failed.
    error:
      fallback.error ||
      `${live.error} Falling back to microphone-only transcription.`,
  }
}
