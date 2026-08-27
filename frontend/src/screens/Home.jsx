export default function Home({ onStart }) {
  return (
    <div className="screen">
      <h1>Second Coworker</h1>
      <p className="subtitle">Your AI teammate that remembers every meeting.</p>
      <button onClick={onStart}>Start Session</button>
    </div>
  )
}
