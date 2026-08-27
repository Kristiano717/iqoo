// Milestone 2 ("save works"): shows whether the transcript actually made it
// into Supabase. AI summary generation is still Milestone 4 — not wired up.
export default function Summary({ session, onRestart }) {
  const { transcript, sessionId, saveError } = session

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
