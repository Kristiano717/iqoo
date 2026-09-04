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
  const [session, setSession] = useState({ transcript: '', sessionId: null, saveError: null })

  const handleSessionEnd = (result) => {
    setSession(result)
    setScreen('summary')
  }

  return (
    <div className="app-shell">
      {screen === 'home' && (
        <Home
          onStart={() => setScreen('live')}
          onRecall={() => setScreen('recall')}
          onReview={() => setScreen('review')}
        />
      )}
      {screen === 'live' && <LiveSession onEnd={handleSessionEnd} />}
      {screen === 'summary' && (
        <Summary
          session={session}
          onRestart={() => setScreen('home')}
          onRecall={() => setScreen('recall')}
        />
      )}
      {screen === 'recall' && <Recall onBack={() => setScreen('home')} />}
      {screen === 'review' && <Review onBack={() => setScreen('home')} />}
    </div>
  )
}
