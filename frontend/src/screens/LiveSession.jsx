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
export default function LiveSession({ onEnd, onCancel }) {
  const {
    isSupported,
    isListening,
    hasRemote,
    segments,
    micSegments,
    finalText,
    interimText,
    interimRemote,
    error,
    start,
    stop,
    mode,
    captureRemote,
  } = useTranscript()
  const [tasks, setTasks] = useState([])
  const [saveState, setSaveState] = useState('idle') // idle | saving | error
  // Capture used to begin the moment this screen mounted, which fired two
  // browser dialogs back to back with no explanation — and the second one,
  // the tab picker, has a checkbox that decides whether the other person is
  // recorded at all. Missing it is the single most likely way a real call
  // gets half-captured, so the instructions come first and capture starts on
  // an explicit press.
  const [phase, setPhase] = useState('ready') // ready | capturing
  // Match start offsets (within the '\n'-joined segments text) already
  // turned into a task — see wakePhrase.js for why re-scanning everything
  // and deduping by offset is what actually handles a phrase split across
  // two finalized chunks without also risking duplicates or runaway captures.
  const seenMatchStartsRef = useRef(new Set())

  const beginCapture = () => {
    setPhase('capturing')
    start()
  }

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

  if (phase === 'ready') {
    return (
      <div className="screen">
        <h1>Live Session</h1>
        <p className="subtitle">
          Your microphone is captured directly. The other person's voice comes out of your
          speakers, not your mic — so it has to be taken from the meeting tab instead.
        </p>

        <ol className="preflight">
          <li>
            <strong>Open the call in another tab</strong> and join it — Google Meet, Zoom on
            the web, or Teams.
          </li>
          <li>
            Press <strong>Start capture</strong>. Your browser asks for the microphone first,
            then which tab to share.
          </li>
          <li>
            Choose the <strong>Chrome Tab</strong> option, pick the meeting tab, and tick{' '}
            <strong>“Also share tab audio”</strong>.
            <span className="emphasis-note">
              That checkbox is the whole thing. Without it the call is shared silently and
              only your own side gets transcribed.
            </span>
          </li>
        </ol>

        <p className="hint">
          Only the audio is used — the video track is stopped the moment it arrives, and
          nothing is written to disk. On speakerphone, the other person reaching your
          microphone as well is detected and dropped rather than transcribed twice.
        </p>

        <div className="controls-row">
          <button onClick={beginCapture}>Start capture</button>
          {onCancel && (
            <button className="secondary" onClick={onCancel}>
              Back to Home
            </button>
          )}
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
        {segments.length === 0 && !interimText && !interimRemote && (
          <span className="placeholder">Start speaking…</span>
        )}
        {segments.map((segment, i) => (
          <p key={i} className={`line ${segment.speaker}`}>
            <span className="who">{segment.speaker === 'you' ? 'You' : 'Them'}</span>
            {segment.text}
          </p>
        ))}
        {/* Both sides stream partial text, so both show it. Rendering only
            the microphone's made the other person look slower than they were:
            their words existed, we just weren't drawing them until the
            utterance closed. */}
        {interimText && (
          <p className="line you interim-line">
            <span className="who">You</span>
            <span className="interim">{interimText}</span>
          </p>
        )}
        {interimRemote && (
          <p className="line them interim-line">
            <span className="who">Them</span>
            <span className="interim">{interimRemote}</span>
          </p>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* The other side isn't being captured. Offer the fix inline rather
          than making the user end a working session and start over. */}
      {isListening && !hasRemote && captureRemote && (
        <div className="notice share-prompt">
          <span>Only your side is being recorded.</span>
          <button type="button" onClick={captureRemote}>Share the meeting tab</button>
        </div>
      )}

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
