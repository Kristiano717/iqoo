import { useState } from 'react'
import Home from './screens/Home.jsx'
import LiveSession from './screens/LiveSession.jsx'
import Summary from './screens/Summary.jsx'
import Recall from './screens/Recall.jsx'
import Review from './screens/Review.jsx'

// Four screens, state-based switching — no router. A prototype with four
// fixed screens and no deep-linking need doesn't need react-router as a
// dependency (CLAUDE.md: avoid unnecessary abstractions).
export default function App() {
  const [screen, setScreen] = useState('home')
  // Lets other screens open a specific meeting rather than dropping the user
  // at an unselected list — used by the agenda, and by anything else that
  // wants to point at where a commitment came from.
  const [reviewSessionId, setReviewSessionId] = useState(null)

  const openSession = (id) => {
    setReviewSessionId(id)
    setScreen('review')
  }
  const [session, setSession] = useState({ transcript: '', sessionId: null, saveError: null })

  const handleSessionEnd = (result) => {
    setSession(result)
    setScreen('summary')
  }

  return (
    <div className="app-shell">
      {/* Persistent wordmark: gives every screen a way home and stops the
          app reading as a sequence of disconnected pages. */}
      <header className="app-bar">
        <button className="wordmark" onClick={() => setScreen('home')}>
          <span className="mark" aria-hidden="true" />
          Second Coworker
        </button>
      </header>
      {screen === 'home' && (
        <Home
          onStart={() => setScreen('live')}
          onRecall={() => setScreen('recall')}
          onReview={() => {
            setReviewSessionId(null)
            setScreen('review')
          }}
          onOpenSession={openSession}
        />
      )}
      {screen === 'live' && (
        <LiveSession onEnd={handleSessionEnd} onCancel={() => setScreen('home')} />
      )}
      {screen === 'summary' && (
        <Summary
          session={session}
          onRestart={() => setScreen('home')}
          onRecall={() => setScreen('recall')}
        />
      )}
      {screen === 'recall' && <Recall onBack={() => setScreen('home')} />}
      {screen === 'review' && (
        <Review onBack={() => setScreen('home')} initialSessionId={reviewSessionId} />
      )}
    </div>
  )
}
