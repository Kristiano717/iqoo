// Stub for Milestone 4 ("summary works"). Wired up once the backend's
// end-of-session LLM call exists. For now it just proves the transcript
// captured in Milestone 1 makes it out of the Live Session screen.
export default function Summary({ transcript, onRestart }) {
  return (
    <div className="screen">
      <h1>Summary</h1>
      <p className="subtitle">AI summary generation isn't wired up yet — this is Milestone 4.</p>

      <div className="placeholder-note">
        Captured transcript ({transcript.length} chars) is ready to send to the backend once
        the summary endpoint exists.
      </div>

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
