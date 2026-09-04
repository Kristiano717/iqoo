import { useEffect, useState } from 'react'
import { summarizeSession } from '../api.js'
import Records from '../components/Records.jsx'
import DateCalendar from '../components/DateCalendar.jsx'

// Milestone 4 ("summary works"): calls the backend's single end-of-session
// LLM extraction once this screen mounts. Kept here rather than in
// LiveSession — that screen's job ends at persisting the raw session +
// wake-phrase tasks; turning that into an AI summary is this screen's job.
export default function Summary({ session, onRestart, onRecall }) {
  const { transcript, sessionId, tasks: liveTasks = [], saveError, taskSaveError } = session
  const [aiState, setAiState] = useState(sessionId ? 'loading' : 'skipped') // loading | done | error | skipped
  const [aiResult, setAiResult] = useState(null)
  const [aiError, setAiError] = useState(null)

  useEffect(() => {
    if (!sessionId) return // nothing to summarize if the session itself never saved
    let cancelled = false
    summarizeSession(sessionId)
      .then((result) => {
        if (cancelled) return
        setAiResult(result)
        setAiState('done')
      })
      .catch((err) => {
        if (cancelled) return
        setAiError(err.message)
        setAiState('error')
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  return (
    <div className="screen">
      <h1>Summary</h1>

      {sessionId ? (
        <div className="saved-note">
          <span className="ok">saved</span>
          <code>{sessionId}</code>
          <span>{transcript.length} chars</span>
        </div>
      ) : (
        <div className="error-banner">
          Save failed{saveError ? `: ${saveError}` : ''}. The transcript is still shown below but
          wasn't stored, so it can't be summarized.
        </div>
      )}

      {taskSaveError && <div className="error-banner">Task save failed: {taskSaveError}</div>}

      {/* Extraction is a single call that can take the better part of a
          minute. Everything already known — the wake-phrase tasks and the
          transcript — is rendered immediately, in the position the final
          results will occupy, so the screen fills in rather than sitting
          empty. A bare spinner over a blank page reads as a hang. */}
      {aiState === 'loading' && (
        <>
          <div className="working">
            <span className="pulse" aria-hidden="true" />
            <span>
              Reading the transcript for decisions, tasks and facts. This runs once per
              session and can take up to a minute.
            </span>
          </div>
          {liveTasks.length > 0 && (
            <Records
              items={liveTasks}
              kind="live"
              label="Tasks captured live"
              empty="None yet."
            />
          )}
        </>
      )}
      {aiState === 'error' && <div className="error-banner">Summary generation failed: {aiError}</div>}

      {aiState === 'done' && (
        <>
          <p>{aiResult.summary}</p>

          {/* Reference is now: Summary is only ever shown for a session that
              just ended, and LiveSession's onEnd payload carries no
              timestamp. Renders nothing when no record names a real day. */}
          <DateCalendar
            records={[...aiResult.tasks, ...aiResult.facts]}
            sessionAt={Date.now()}
          />

          <Records items={aiResult.tasks} kind="task" label="Tasks" empty="None extracted." />
          <Records items={aiResult.facts} kind="fact" label="Key facts" empty="None extracted." />
        </>
      )}

      {aiState === 'done' && liveTasks.length > 0 && (
        <details>
          <summary>Captured live by wake phrase ({liveTasks.length})</summary>
          <ul className="records is-live">
            {liveTasks.map((t, i) => (
              <li key={i}><span className="tag">task</span><span>{t}</span></li>
            ))}
          </ul>
        </details>
      )}

      <details>
        <summary>Raw transcript</summary>
        <div className="transcript-box">{transcript || '(empty — no speech captured)'}</div>
      </details>

      <div className="controls-row">
        <button className="secondary" onClick={onRestart}>Back to Home</button>
        <button className="secondary" onClick={onRecall}>Ask About Past Sessions</button>
      </div>
    </div>
  )
}
