import { useEffect, useRef, useState } from 'react'
import { useTranscript } from '../hooks/useTranscript.js'
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
// Both sides of the call are transcribed: the microphone and the other
// participant's audio run as two separate Gemini Live sessions, so every
// segment carries who said it. Wake-phrase scanning reads micSegments only —
// see the note in useLiveTranscript for why the merged stream would break
// the offset dedupe, and why "Hey Coworker" should be the user's to say.
export default function LiveSession({ onEnd }) {
  const {
    isSupported,
    isListening,
    hasRemote,
    segments,
    micSegments,
    finalText,
    interimText,
    error,
    start,
    stop,
    mode,
  } = useTranscript()
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
    if (micSegments.length === 0) return
    const joined = micSegments.join('\n')
    const newTasks = []
    for (const match of findAllWakePhraseMatches(joined)) {
      if (!seenMatchStartsRef.current.has(match.start)) {
        seenMatchStartsRef.current.add(match.start)
        newTasks.push(match.task)
      }
    }
    if (newTasks.length > 0) setTasks((prev) => [...prev, ...newTasks])
  }, [micSegments])

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
          This browser can't capture call audio. Open the app in desktop Chrome or Edge —
          sharing another tab's audio isn't available on mobile browsers.
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
        <span className={`source-tag ${hasRemote ? 'on' : ''}`}>
          {hasRemote ? 'both sides' : mode === 'fallback' ? 'fallback · mic only' : 'your mic only'}
        </span>
      </div>

      <div className="transcript-box">
        {segments.length === 0 && !interimText && (
          <span className="placeholder">Start speaking…</span>
        )}
        {segments.map((segment, i) => (
          <p key={i} className={`line ${segment.speaker}`}>
            <span className="who">{segment.speaker === 'you' ? 'You' : 'Them'}</span>
            {segment.text}
          </p>
        ))}
        {interimText && (
          <p className="line you interim-line">
            <span className="who">You</span>
            <span className="interim">{interimText}</span>
          </p>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

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
