// The landing surface. Its job is to make one idea legible in a glance:
// speech goes in, structured records come out. The panels below say that
// with the product's own materials rather than describing it in prose —
// the sample lines are illustrative, not anyone's real meeting.
export default function Home({ onStart, onRecall, onReview }) {
  return (
    <div className="screen home">
      <div className="hero">
        <p className="eyebrow">Meeting memory</p>
        <h1>Remembers what the meeting decided.</h1>
        <p className="subtitle">
          Not a transcript you search later. Decisions, tasks and facts pulled out of both
          sides of the call as structured memory — and answered back weeks on, when you've
          forgotten which meeting to look in.
        </p>

        <div className="controls-row">
          <button onClick={onStart}>Start a session</button>
          <button className="ghost" onClick={onRecall}>Ask about past sessions →</button>
        </div>
      </div>

      {/* The thesis, shown rather than claimed. */}
      <div className="transform" aria-hidden="true">
        <div className="tf-panel">
          <span className="tf-label">What was said</span>
          <p className="tf-line"><span className="who them">Them</span>We need the pricing sheet finalised before Friday.</p>
          <p className="tf-line"><span className="who you">You</span>Fine — I'll move the redesign to Q3 then.</p>
          <p className="tf-line"><span className="who them">Them</span>And we'd prefer weekly check-ins, not daily.</p>
        </div>

        <div className="tf-arrow"><span>&rarr;</span></div>

        <div className="tf-panel tf-kept">
          <span className="tf-label">What was kept</span>
          <div className="tf-record"><em className="tag fact">fact</em>Pricing sheet is due Friday</div>
          <div className="tf-record"><em className="tag fact">fact</em>Redesign moved to Q3</div>
          <div className="tf-record"><em className="tag fact">fact</em>Client prefers weekly check-ins</div>
          <div className="tf-record"><em className="tag task">task</em>Send the updated deck</div>
        </div>
      </div>

      {/* Properties of the built system, not slogans — the things a
          first-time user would otherwise have to discover. */}
      <div className="home-points">
        <div>
          <strong>Both sides, kept apart</strong>
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

      <div className="home-foot">
        <button className="ghost" onClick={onReview}>Review past sessions →</button>
      </div>
    </div>
  )
}
