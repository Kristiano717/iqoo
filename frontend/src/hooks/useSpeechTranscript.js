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
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState(null)

  const recognitionRef = useRef(null)
  // Ref mirror of finalText so the 'end' handler's auto-restart (below)
  // always sees the latest transcript without re-subscribing on every change.
  const finalTextRef = useRef('')
  const wantListeningRef = useRef(false)

  useEffect(() => {
    if (!isSupported) return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event) => {
      let interim = ''
      let finalChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalChunk += result[0].transcript + ' '
        } else {
          interim += result[0].transcript
        }
      }
      if (finalChunk) {
        finalTextRef.current = (finalTextRef.current + finalChunk)
        setFinalText(finalTextRef.current)
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
    recognition.onend = () => {
      if (wantListeningRef.current) {
        try {
          recognition.start()
        } catch {
          // already starting/started — ignore
        }
      } else {
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition

    return () => {
      wantListeningRef.current = false
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
    setInterimText('')
    wantListeningRef.current = true
    setIsListening(true)
    recognitionRef.current.start()
  }, [])

  const stop = useCallback(() => {
    if (!recognitionRef.current) return
    wantListeningRef.current = false
    recognitionRef.current.stop()
    setIsListening(false)
  }, [])

  return { isSupported, isListening, finalText, interimText, error, start, stop }
}
