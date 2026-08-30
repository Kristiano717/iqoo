import { useState } from 'react'
import { askRecall } from '../api.js'
import Markdown from '../components/Markdown.jsx'

// Milestone 5 ("recall works"): the last piece of the loop. User asks a
// question, backend pulls recent session summaries + facts by recency
// (no vector search per CLAUDE.md) and the LLM answers from that context
// alone — saying it doesn't know rather than guessing.
export default function Recall({ onBack }) {
  const [question, setQuestion] = useState('')
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // Suggestion chips: a judge or first-time user has no idea what this
  // can answer. Showing three real questions is faster than explaining.
  const SUGGESTIONS = [
    "What did I decide in yesterday's meeting?",
    'What is still outstanding?',
    'What does the client want?',
  ]

  const ask = async (q) => {
    if (!q) return
    setQuestion(q)
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

  const handleSubmit = (e) => {
    e.preventDefault()
    ask(question.trim())
  }

  return (
    <div className="screen">
      <h1>Recall</h1>
      <p className="subtitle">
        Answered from stored memory objects — never by re-reading a transcript.
      </p>

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

      {state === 'idle' && (
        <div className="suggestions">
          {SUGGESTIONS.map((q) => (
            <button type="button" key={q} onClick={() => ask(q)}>{q}</button>
          ))}
        </div>
      )}

      {state === 'error' && <div className="error-banner">{error}</div>}

      {state === 'done' && result && (
        <div className="recall-answer">
          <Markdown text={result.answer} />
          <p className="recall-meta">
            {result.sessions_searched} session{result.sessions_searched === 1 ? '' : 's'} searched
          </p>
        </div>
      )}

      <div className="controls-row">
        <button className="secondary" onClick={onBack}>Back to Home</button>
      </div>
    </div>
  )
}
