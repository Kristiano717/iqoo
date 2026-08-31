import { useCallback, useEffect, useRef, useState } from 'react'

// Thin wrapper around the browser-native Web Speech API (SpeechRecognition).
// Per CLAUDE.md: transcription runs entirely client-side, no server round-trip.
// Chrome/Edge only (webkitSpeechRecognition) — that's a known limitation of
// the Web Speech API itself, not something to work around for this prototype.
export function useSpeechTranscript() {
  const [isSupported] = useState(
    () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  )
  const [isListening, setIsListening] = useState(false)
  const [finalText, setFinalText] = useState('')
  // Each entry is one raw finalized chunk from the recognizer, in arrival
  // order — undivided, never edited after being appended. Exposed
  // separately from finalText so wake-phrase matching (LiveSession) can
  // scan discrete chunks instead of diffing an ever-growing string, which
  // both misses phrases split across a chunk boundary and, worse, lets an
  // unbounded regex capture group swallow unrelated future speech.
  const [finalSegments, setFinalSegments] = useState([])
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState(null)

  const recognitionRef = useRef(null)
  // Ref mirror of finalText so the 'end' handler's auto-restart (below)
  // always sees the latest transcript without re-subscribing on every change.
  const finalTextRef = useRef('')
  const wantListeningRef = useRef(false)
  // Handle for the pending auto-restart, so stopping the session can cancel a
  // restart that's already in flight (see the 'end' handler below).
  const restartTimerRef = useRef(null)

  useEffect(() => {
    if (!isSupported) return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let interim = ''
      const newFinals = []
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          newFinals.push(result[0].transcript.trim())
        } else {
          interim += result[0].transcript
        }
      }
      if (newFinals.length > 0) {
        finalTextRef.current = finalTextRef.current + newFinals.join(' ') + ' '
        setFinalText(finalTextRef.current)
        setFinalSegments((prev) => [...prev, ...newFinals])
      }
      setInterimText(interim)
    }

    recognition.onerror = (event) => {
      // 'no-speech' fires constantly during natural pauses — not a real error.
      if (event.error === 'no-speech') return
      setError(event.error)
    }

    // The API auto-stops after periods of silence even in continuous mode.
    // If the user hasn't ended the session, restart it transparently.
    //
    // The delay matters on Android: Chrome there ignores `continuous` and
    // ends recognition after every single utterance, so this handler fires
    // constantly. Restarting synchronously inside it races the teardown of
    // the session that just ended — start() throws InvalidStateError, the
    // catch swallows it, and the transcript dies after one sentence. A short
    // gap makes the restart reliable on the phone and is imperceptible on
    // desktop, where this path is rare anyway.
    recognition.onend = () => {
      if (!wantListeningRef.current) {
        setIsListening(false)
        return
      }
      restartTimerRef.current = setTimeout(() => {
        if (!wantListeningRef.current) return
        try {
          recognition.start()
        } catch {
          // already starting/started — ignore
        }
      }, 300)
    }

    recognitionRef.current = recognition

    return () => {
      wantListeningRef.current = false
      clearTimeout(restartTimerRef.current)
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.stop()
    }
  }, [isSupported])

  const start = useCallback(() => {
    if (!recognitionRef.current) return
    setError(null)
    finalTextRef.current = ''
    setFinalText('')
    setFinalSegments([])
    setInterimText('')
    wantListeningRef.current = true
    setIsListening(true)
    recognitionRef.current.start()
  }, [])

  const stop = useCallback(() => {
    if (!recognitionRef.current) return
    wantListeningRef.current = false
    clearTimeout(restartTimerRef.current)
    recognitionRef.current.stop()
    setIsListening(false)
  }, [])

  return { isSupported, isListening, finalText, finalSegments, interimText, error, start, stop }
}
