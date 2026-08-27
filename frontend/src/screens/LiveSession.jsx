import { useEffect, useState } from 'react'
import { useSpeechTranscript } from '../hooks/useSpeechTranscript.js'
import { saveSession } from '../api.js'

// Milestone 1 ("transcript works") gave us the live transcript. Milestone 2
// ("save works") adds this: on End Session, POST the transcript to the
// backend so it lands in Supabase's `sessions` table. Wake-phrase/task tray
// is still the next milestone after this — deliberately not here yet.
export default function LiveSession({ onEnd }) {
  const { isSupported, isListening, finalText, interimText, error, start, stop } = useSpeechTranscript()
  const [saveState, setSaveState] = useState('idle') // idle | saving | error

  useEffect(() => {
    if (isSupported) start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported])

  const handleEnd = async () => {
    stop()
    const transcript = finalText.trim()
    setSaveState('saving')
    try {
      const saved = await saveSession(transcript)
      onEnd({ transcript, sessionId: saved.id })
    } catch (err) {
      // Don't strand the user on a broken save — let them continue to the
      // Summary screen with the transcript still in hand, just unsaved.
      setSaveState('error')
      onEnd({ transcript, sessionId: null, saveError: err.message })
    }
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
        <button onClick={handleEnd} disabled={saveState === 'saving'}>
          {saveState === 'saving' ? 'Saving…' : 'End Session'}
        </button>
      </div>
    </div>
  )
}
