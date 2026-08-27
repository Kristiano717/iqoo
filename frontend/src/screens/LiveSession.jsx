import { useEffect } from 'react'
import { useSpeechTranscript } from '../hooks/useSpeechTranscript.js'

// Milestone 1 ("transcript works"): live transcript only. Wake-phrase
// detection and the task tray are the next milestone (see CLAUDE.md git
// workflow order) — deliberately not wired up yet so this stays a real,
// demoable increment rather than a half-built screen.
export default function LiveSession({ onEnd }) {
  const { isSupported, isListening, finalText, interimText, error, start, stop } = useSpeechTranscript()

  useEffect(() => {
    if (isSupported) start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported])

  const handleEnd = () => {
    stop()
    onEnd(finalText.trim())
  }

  if (!isSupported) {
    return (
      <div className="screen">
        <h1>Live Session</h1>
        <div className="error-banner">
          This browser doesn't support the Web Speech API. Use Chrome or Edge for the live transcript demo.
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <h1>Live Session</h1>
      <div className="status-row">
        <span className={`status-dot ${isListening ? 'live' : ''}`} />
        <span>{isListening ? 'Listening…' : 'Stopped'}</span>
      </div>

      <div className="transcript-box">
        {finalText || <span style={{ color: '#999' }}>Start speaking…</span>}
        {interimText && <span className="interim">{finalText ? ' ' : ''}{interimText}</span>}
      </div>

      {error && <div className="error-banner">Speech recognition error: {error}</div>}

      <div className="controls-row">
        <button onClick={handleEnd}>End Session</button>
      </div>
    </div>
  )
}
