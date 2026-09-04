export default function Home({ onStart, onRecall, onReview }) {
  return (
    <div className="screen">
      <h1>Remembers what<br />the meeting decided.</h1>
      <p className="subtitle">
        Not a transcript you search later — decisions, tasks and facts pulled out as
        structured memory, and answered back when you ask.
      </p>
      <div className="controls-row">
        <button onClick={onStart}>Start Session</button>
        <button className="secondary" onClick={onRecall}>Ask About Past Sessions</button>
        <button className="secondary" onClick={onReview}>Review Past Sessions</button>
      </div>
    </div>
  )
}
