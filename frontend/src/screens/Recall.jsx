import { useState } from 'react'
import { askRecall } from '../api.js'

// Milestone 5 ("recall works"): the last piece of the loop. User asks a
// question, backend pulls recent session summaries + facts by recency
// (no vector search per CLAUDE.md) and the LLM answers from that context
// alone — saying it doesn't know rather than guessing.
export default function Recall({ onBack }) {
  const [question, setQuestion] = useState('')
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const q = question.trim()
    if (!q) return

    setState('loading')
    setError(null)
    try {
      const res = await askRecall(q)
      setResult(res)
      setState('done')
    } catch (err) {
      setError(err.message)
      setState('error')
    }
  }

  return (
    <div className="screen">
      <h1>Recall</h1>
      <p className="subtitle">Ask about anything from your past sessions.</p>

      <form onSubmit={handleSubmit} className="recall-form">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What did I decide in yesterday's meeting?"
          aria-label="Recall question"
        />
        <button type="submit" disabled={state === 'loading' || !question.trim()}>
          {state === 'loading' ? 'Searching…' : 'Ask'}
        </button>
      </form>

      {state === 'error' && <div className="error-banner">{error}</div>}

      {state === 'done' && result && (
        <div className="recall-answer">
          <p style={{ margin: 0, lineHeight: 1.55 }}>{result.answer}</p>
          <p className="recall-meta">
            Answered from {result.sessions_searched} past{' '}
            {result.sessions_searched === 1 ? 'session' : 'sessions'}.
          </p>
        </div>
      )}

      <div className="controls-row">
        <button className="secondary" onClick={onBack}>Back to Home</button>
      </div>
    </div>
  )
}
