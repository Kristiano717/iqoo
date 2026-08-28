import { useEffect, useState } from 'react'
import { summarizeSession } from '../api.js'

// Milestone 4 ("summary works"): calls the backend's single end-of-session
// LLM extraction once this screen mounts. Kept here rather than in
// LiveSession — that screen's job ends at persisting the raw session +
// wake-phrase tasks; turning that into an AI summary is this screen's job.
export default function Summary({ session, onRestart }) {
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
        <div className="placeholder-note">
          Saved to Supabase — session <code>{sessionId}</code> ({transcript.length} chars).
        </div>
      ) : (
        <div className="error-banner">
          Save failed{saveError ? `: ${saveError}` : ''}. Transcript is still shown below but wasn't persisted,
          so it can't be summarized either.
        </div>
      )}

      {taskSaveError && <div className="error-banner">Task save failed: {taskSaveError}</div>}

      {aiState === 'loading' && <p className="subtitle">Generating summary…</p>}
      {aiState === 'error' && <div className="error-banner">Summary generation failed: {aiError}</div>}

      {aiState === 'done' && (
        <>
          <p style={{ lineHeight: 1.5 }}>{aiResult.summary}</p>

          <h2 style={{ fontSize: '1.1rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>
            Tasks {aiResult.tasks.length > 0 && `(${aiResult.tasks.length})`}
          </h2>
          {aiResult.tasks.length === 0 ? (
            <p style={{ color: '#999', margin: 0 }}>None extracted.</p>
          ) : (
            <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
              {aiResult.tasks.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}

          <h2 style={{ fontSize: '1.1rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>
            Key Facts {aiResult.facts.length > 0 && `(${aiResult.facts.length})`}
          </h2>
          {aiResult.facts.length === 0 ? (
            <p style={{ color: '#999', margin: 0 }}>None extracted.</p>
          ) : (
            <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
              {aiResult.facts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {liveTasks.length > 0 && (
        <details style={{ marginTop: '1.5rem' }}>
          <summary>Wake-phrase tasks captured live ({liveTasks.length})</summary>
          <ul style={{ paddingLeft: '1.25rem' }}>
            {liveTasks.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </details>
      )}

      <details style={{ marginTop: '1rem' }}>
        <summary>Raw transcript (debug)</summary>
        <div className="transcript-box">{transcript || '(empty — no speech captured)'}</div>
      </details>

      <div className="controls-row">
        <button className="secondary" onClick={onRestart}>Back to Home</button>
      </div>
    </div>
  )
}
