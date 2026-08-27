import { useEffect, useRef, useState } from 'react'
import { useSpeechTranscript } from '../hooks/useSpeechTranscript.js'
import { saveSession, saveTasks } from '../api.js'
import { extractTask } from '../wakePhrase.js'

// Milestone 1 gave us the live transcript, Milestone 2 saves the session.
// Milestone 3 ("tasks work") adds this: wake-phrase detection runs live,
// client-side, on each newly-finalized transcript chunk (still just a
// regex match per CLAUDE.md — no second AI model running continuously).
// Matches populate the task tray immediately; the tray is only POSTed to
// the backend once, at End Session, alongside the transcript.
export default function LiveSession({ onEnd }) {
  const { isSupported, isListening, finalText, interimText, error, start, stop } = useSpeechTranscript()
  const [tasks, setTasks] = useState([])
  const [saveState, setSaveState] = useState('idle') // idle | saving | error
  const processedLenRef = useRef(0)

  useEffect(() => {
    if (isSupported) start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported])

  // Only scan the newly-appended slice of finalText, not the whole
  // transcript every time — otherwise an already-matched phrase would
  // re-fire a new task on every subsequent onresult event.
  useEffect(() => {
    const newSegment = finalText.slice(processedLenRef.current)
    processedLenRef.current = finalText.length
    if (!newSegment.trim()) return

    const task = extractTask(newSegment)
    if (task) setTasks((prev) => [...prev, task])
  }, [finalText])

  const handleEnd = async () => {
    stop()
    const transcript = finalText.trim()
    setSaveState('saving')
    try {
      const saved = await saveSession(transcript)
      try {
        await saveTasks(saved.id, tasks)
      } catch (taskErr) {
        // Session saved fine; tasks failed. Still hand off to Summary
        // rather than losing the saved session over a secondary failure.
        onEnd({ transcript, sessionId: saved.id, tasks, taskSaveError: taskErr.message })
        return
      }
      onEnd({ transcript, sessionId: saved.id, tasks })
    } catch (err) {
      setSaveState('error')
      onEnd({ transcript, sessionId: null, tasks, saveError: err.message })
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

      <h2 style={{ fontSize: '1.1rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>
        Task Tray {tasks.length > 0 && `(${tasks.length})`}
      </h2>
      {tasks.length === 0 ? (
        <p style={{ color: '#999', margin: 0 }}>
          Say "Hey Coworker, remind me to…" to capture a task.
        </p>
      ) : (
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          {tasks.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}

      <div className="controls-row">
        <button onClick={handleEnd} disabled={saveState === 'saving'}>
          {saveState === 'saving' ? 'Saving…' : 'End Session'}
        </button>
      </div>
    </div>
  )
}
