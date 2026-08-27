// Milestone 2 ("save works") + Milestone 3 ("tasks work"): shows whether
// the transcript and wake-phrase tasks actually made it into Supabase.
// AI summary generation is still Milestone 4 — not wired up.
export default function Summary({ session, onRestart }) {
  const { transcript, sessionId, tasks = [], saveError, taskSaveError } = session

  return (
    <div className="screen">
      <h1>Summary</h1>
      <p className="subtitle">AI summary generation isn't wired up yet — this is Milestone 4.</p>

      {sessionId ? (
        <div className="placeholder-note">
          Saved to Supabase — session <code>{sessionId}</code> ({transcript.length} chars).
        </div>
      ) : (
        <div className="error-banner">
          Save failed{saveError ? `: ${saveError}` : ''}. Transcript is still shown below but wasn't persisted.
        </div>
      )}

      {taskSaveError && (
        <div className="error-banner">Task save failed: {taskSaveError}</div>
      )}

      <h2 style={{ fontSize: '1.1rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>
        Tasks Captured {tasks.length > 0 && `(${tasks.length})`}
      </h2>
      {tasks.length === 0 ? (
        <p style={{ color: '#999', margin: 0 }}>None — no wake phrase detected this session.</p>
      ) : (
        <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
          {tasks.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}

      <details style={{ marginTop: '1.5rem' }}>
        <summary>Raw transcript (debug)</summary>
        <div className="transcript-box">{transcript || '(empty — no speech captured)'}</div>
      </details>

      <div className="controls-row">
        <button className="secondary" onClick={onRestart}>Back to Home</button>
      </div>
    </div>
  )
}
