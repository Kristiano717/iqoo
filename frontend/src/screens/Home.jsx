export default function Home({ onStart, onRecall }) {
  return (
    <div className="screen">
      <h1>Second Coworker</h1>
      <p className="subtitle">Your AI teammate that remembers every meeting.</p>
      <div className="controls-row" style={{ marginTop: '1.5rem' }}>
        <button onClick={onStart}>Start Session</button>
        <button className="secondary" onClick={onRecall}>Ask About Past Sessions</button>
      </div>
    </div>
  )
}
