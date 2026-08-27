import { useState } from 'react'
import Home from './screens/Home.jsx'
import LiveSession from './screens/LiveSession.jsx'
import Summary from './screens/Summary.jsx'
import Recall from './screens/Recall.jsx'

// Four screens, state-based switching — no router. A prototype with four
// fixed screens and no deep-linking need doesn't need react-router as a
// dependency (CLAUDE.md: avoid unnecessary abstractions).
export default function App() {
  const [screen, setScreen] = useState('home')
  const [transcript, setTranscript] = useState('')

  const handleSessionEnd = (finalTranscript) => {
    setTranscript(finalTranscript)
    setScreen('summary')
  }

  return (
    <div className="app-shell">
      {screen === 'home' && <Home onStart={() => setScreen('live')} />}
      {screen === 'live' && <LiveSession onEnd={handleSessionEnd} />}
      {screen === 'summary' && <Summary transcript={transcript} onRestart={() => setScreen('home')} />}
      {screen === 'recall' && <Recall onBack={() => setScreen('home')} />}
    </div>
  )
}
