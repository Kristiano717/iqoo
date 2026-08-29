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
  const [session, setSession] = useState({ transcript: '', sessionId: null, saveError: null })
  // Web Speech is the default because it's the path that's actually
  // verified working end to end. On-device Whisper is wired up and
  // selectable, but its browser-side init is still being debugged — until
  // that's confirmed on real hardware, the demo shouldn't depend on it.
  const [engine, setEngine] = useState('webspeech')

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
          engine={engine}
          onEngineChange={setEngine}
        />
      )}
      {screen === 'live' && <LiveSession engine={engine} onEnd={handleSessionEnd} />}
      {screen === 'summary' && (
        <Summary
          session={session}
          onRestart={() => setScreen('home')}
          onRecall={() => setScreen('recall')}
        />
      )}
      {screen === 'recall' && <Recall onBack={() => setScreen('home')} />}
    </div>
  )
}
