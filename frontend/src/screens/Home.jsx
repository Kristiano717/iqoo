export default function Home({ onStart, onRecall, engine, onEngineChange }) {
  return (
    <div className="screen">
      <h1>Second Coworker</h1>
      <p className="subtitle">Your AI teammate that remembers every meeting.</p>
      <div className="controls-row" style={{ marginTop: '1.5rem' }}>
        <button onClick={onStart}>Start Session</button>
        <button className="secondary" onClick={onRecall}>Ask About Past Sessions</button>
      </div>

      {/* Exposed on Home rather than buried in settings so the engine can be
          switched before a demo starts, without touching code. */}
      <fieldset className="engine-picker">
        <legend>Transcription</legend>
        <label>
          <input
            type="radio"
            name="engine"
            value="webspeech"
            checked={engine === 'webspeech'}
            onChange={() => onEngineChange('webspeech')}
          />
          <span>
            <strong>Cloud (Web Speech)</strong>
            <em>Verified working. Word-by-word, near-instant — sends audio to Google. Chrome/Edge only.</em>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name="engine"
            value="whisper"
            checked={engine === 'whisper'}
            onChange={() => onEngineChange('whisper')}
          />
          <span>
            <strong>On-device (Whisper) — experimental</strong>
            <em>Audio never leaves this device, ~2s after each pause. Model init still being debugged; first load downloads ~152MB.</em>
          </span>
        </label>
      </fieldset>
    </div>
  )
}
