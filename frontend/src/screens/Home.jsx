export default function Home({ onStart, onRecall, onReview }) {
  return (
    <div className="screen home">
      <h1>Remembers what the meeting decided.</h1>
      <p className="subtitle">
        Not a transcript you search later. Decisions, tasks and facts pulled out as
        structured memory — from both sides of the call — and answered back when you ask.
      </p>

      <div className="controls-row">
        <button onClick={onStart}>Start a session</button>
        <button className="secondary" onClick={onRecall}>Ask about past sessions</button>
        <button className="secondary" onClick={onReview}>Review sessions</button>
      </div>

      {/* Three claims, each a property of the built system rather than a
          slogan — they're the things a first-time user won't guess. */}
      <div className="home-points">
        <div>
          <strong>Both sides, separately</strong>
          <span>
            Your microphone and the other participant are captured as two streams, so every
            line knows who said it — with no diarization model involved.
          </span>
        </div>
        <div>
          <strong>Nothing heavy runs live</strong>
          <span>
            Only transcription and a wake-phrase match. The meeting is read once, after it
            ends, so cost scales with meetings rather than minutes.
          </span>
        </div>
        <div>
          <strong>It admits what it missed</strong>
          <span>
            Recall answers from stored memory alone. If something was never discussed, it
            says so instead of inventing it.
          </span>
        </div>
      </div>
    </div>
  )
}
