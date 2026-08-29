import { useEffect, useRef, useState } from 'react'
import { useTranscript } from '../hooks/useTranscript.js'
import { saveSession, saveTasks } from '../api.js'
import { findAllWakePhraseMatches } from '../wakePhrase.js'

// Milestone 1 gave us the live transcript, Milestone 2 saves the session.
// Milestone 3 ("tasks work") adds this: wake-phrase detection runs live,
// client-side, on each newly-finalized transcript chunk (still just a
// regex match per CLAUDE.md — no second AI model running continuously).
// Matches populate the task tray immediately; the tray is only POSTed to
// the backend once, at End Session, alongside the transcript.
//
// The transcription engine is chosen by the caller (see useTranscript):
// on-device Whisper by default, Chrome's cloud recognition as fallback.
// Everything below is engine-agnostic — it only consumes finalSegments.
export default function LiveSession({ engine, onEnd }) {
  const {
    isSupported,
    isListening,
    finalText,
    finalSegments,
    interimText,
    error,
    start,
    stop,
    modelState,
    loadProgress,
    level,
  } = useTranscript(engine)
  const [tasks, setTasks] = useState([])
  const [saveState, setSaveState] = useState('idle') // idle | saving | error
  // Match start offsets (within the '\n'-joined segments text) already
  // turned into a task — see wakePhrase.js for why re-scanning everything
  // and deduping by offset is what actually handles a phrase split across
  // two finalized chunks without also risking duplicates or runaway captures.
  const seenMatchStartsRef = useRef(new Set())

  useEffect(() => {
    if (isSupported) start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported])

  useEffect(() => {
    if (finalSegments.length === 0) return
    const joined = finalSegments.join('\n')
    const newTasks = []
    for (const match of findAllWakePhraseMatches(joined)) {
      if (!seenMatchStartsRef.current.has(match.start)) {
        seenMatchStartsRef.current.add(match.start)
        newTasks.push(match.task)
      }
    }
    if (newTasks.length > 0) setTasks((prev) => [...prev, ...newTasks])
  }, [finalSegments])

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
          This browser doesn't support the Web Speech API. Use Chrome or Edge, or switch to the
          on-device Whisper engine, which works anywhere.
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
        <span className="engine-tag">
          {engine === 'webspeech' ? 'cloud speech' : 'on-device whisper'}
        </span>
        {/* Replaces Web Speech's interim text: with Whisper there's nothing
            to show mid-sentence, so the meter carries "we can hear you". */}
        {isListening && level !== undefined && (
          <span className="level-meter" aria-hidden="true">
            <span className="level-fill" style={{ transform: `scaleX(${Math.min(1, level)})` }} />
          </span>
        )}
      </div>

      {modelState === 'loading' && (
        <div className="notice">
          Loading the on-device speech model
          {loadProgress > 0 ? ` — ${Math.round(loadProgress * 100)}%` : '…'}. Speak anyway;
          anything said now is transcribed once it finishes.
        </div>
      )}

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
