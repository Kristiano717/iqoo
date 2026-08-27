// Stub for Milestone 5 ("recall works"). Not implemented until sessions are
// actually persisted to Supabase — recall has nothing to retrieve until then.
export default function Recall({ onBack }) {
  return (
    <div className="screen">
      <h1>Recall</h1>
      <p className="subtitle">Cross-session memory recall isn't wired up yet — this is Milestone 5.</p>
      <div className="controls-row">
        <button className="secondary" onClick={onBack}>Back to Home</button>
      </div>
    </div>
  )
}
