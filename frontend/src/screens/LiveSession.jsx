import { useEffect, useRef, useState } from 'react'
import { useSpeechTranscript } from '../hooks/useSpeechTranscript.js'
import { saveSession, saveTasks } from '../api.js'
import { findAllWakePhraseMatches } from '../wakePhrase.js'
import Records from '../components/Records.jsx'

// Milestone 1 gave us the live transcript, Milestone 2 saves the session.
// Milestone 3 ("tasks work") adds this: wake-phrase detection runs live,
// client-side, on each newly-finalized transcript chunk (still just a
// regex match per CLAUDE.md — no second AI model running continuously).
// Matches populate the task tray immediately; the tray is only POSTed to
// the backend once, at End Session, alongside the transcript.
//
// Transcription is the browser's Web Speech API, per CLAUDE.md's locked
// stack. Nothing here touches the recognizer directly — it only consumes
// finalSegments, so swapping the engine later stays a one-import change.
export default function LiveSession({ onEnd }) {
  const {
    isSupported,
    isListening,
    finalText,
    finalSegments,
    interimText,
    error,
    start,
    stop,
  } = useSpeechTranscript()
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

    // Nothing was captured, so there's no session to save. Guarding here
    // rather than letting the POST through matters for the demo: the row
    // would save fine and only fail at the summarize step, which surfaces
    // as a red 400 on the Summary screen — and the empty session still
    // counts against the newest-10 window that recall retrieves from, so a
    // few stray taps quietly crowd real meetings out of the answer.
    if (!transcript) {
      setSaveState('empty')
      return
    }

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
          This browser doesn't support the Web Speech API. Open the app in Chrome or Edge.
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <h1>Live Session</h1>
      <div className="instrument">
        <span className={`rec ${isListening ? 'on' : ''}`}>
          <span className={`status-dot ${isListening ? 'live' : ''}`} />
          {isListening ? 'recording' : 'stopped'}
        </span>
        <span className="spacer" />
      </div>

      <div className="transcript-box">
        {finalText || <span className="placeholder">Start speaking…</span>}
        {interimText && <span className="interim">{finalText ? ' ' : ''}{interimText}</span>}
      </div>

      {error && <div className="error-banner">Speech recognition error: {error}</div>}

      {saveState === 'empty' && (
        <div className="notice">
          Nothing was transcribed, so there's no session to save. Check that the tab has
          microphone access and that the page is on <code>localhost</code> or an
          <code> https://</code> address — speech recognition is blocked on a plain-HTTP
          network address like <code>http://192.168.x.x</code>.
        </div>
      )}

      <Records
        items={tasks}
        kind="live"
        label="Task tray"
        empty={'Say "Hey Coworker, remind me to…" and it lands here instantly.'}
      />

      <div className="controls-row">
        {saveState === 'empty' && (
          <button
            onClick={() => {
              // start() clears the transcript state, so reset the wake-phrase
              // offset memo alongside it — otherwise offsets recorded before
              // the restart would suppress matches at the same position.
              seenMatchStartsRef.current = new Set()
              setSaveState('idle')
              start()
            }}
          >
            Resume recording
          </button>
        )}
        <button className="danger" onClick={handleEnd} disabled={saveState === 'saving'}>
          {saveState === 'saving' ? 'Saving…' : 'End Session'}
        </button>
      </div>
    </div>
  )
}
