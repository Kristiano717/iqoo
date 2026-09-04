import { useEffect, useRef, useState } from 'react'
import { fetchSession, fetchSessions } from '../api.js'
import Records from '../components/Records.jsx'
import Markdown from '../components/Markdown.jsx'

// Browse past meetings one at a time.
//
// Recall answers questions across sessions; this is the other half — opening
// a single meeting and seeing what came out of it. Read-only: everything
// shown was already stored when the session ended.
//
// Master–detail rather than a list that navigates away, so a meeting can be
// read while the others stay in view. Collapses to one column on narrow
// screens, where the list and detail become separate steps.

/** Derive a label from the summary — there is no title column. */
function labelFor(session) {
  const summary = (session.summary || '').trim()
  if (!summary) {
    // Extraction failed or never ran. Fall back to the time of day rather
    // than an empty row — these exist in real data.
    return timeOf(session.timestamp)
  }
  // First sentence, trimmed to something that fits a sidebar.
  const firstSentence = summary.split(/(?<=[.!?])\s/)[0] || summary
  return firstSentence.length > 58 ? `${firstSentence.slice(0, 55).trimEnd()}…` : firstSentence
}

function timeOf(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function dayKey(ts) {
  return new Date(ts).toDateString()
}

function dayLabel(ts) {
  const date = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(ts) === today.toDateString()) return 'Today'
  if (dayKey(ts) === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Sessions grouped into [{ label, items }], preserving newest-first order. */
function groupByDay(sessions) {
  const groups = []
  for (const session of sessions) {
    const key = dayKey(session.timestamp)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(session)
    else groups.push({ key, label: dayLabel(session.timestamp), items: [session] })
  }
  return groups
}

export default function Review({ onBack }) {
  const [sessions, setSessions] = useState([])
  const [listState, setListState] = useState('loading') // loading | done | error
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailState, setDetailState] = useState('idle') // idle | loading | done | error
  // Details already fetched, so going back and re-selecting is instant.
  const cacheRef = useRef(new Map())

  useEffect(() => {
    let cancelled = false
    fetchSessions()
      .then((rows) => {
        if (cancelled) return
        setSessions(rows)
        setListState('done')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setListState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const select = async (id) => {
    setSelectedId(id)
    const cached = cacheRef.current.get(id)
    if (cached) {
      setDetail(cached)
      setDetailState('done')
      return
    }
    setDetailState('loading')
    try {
      const full = await fetchSession(id)
      cacheRef.current.set(id, full)
      setDetail(full)
      setDetailState('done')
    } catch (err) {
      setError(err.message)
      setDetailState('error')
    }
  }

  const groups = groupByDay(sessions)

  return (
    <div className={`screen review ${selectedId ? 'has-selection' : ''}`}>
      <h1>Sessions</h1>
      <p className="subtitle">
        Every meeting that was recorded, and the memory objects pulled out of it.
      </p>

      {listState === 'error' && <div className="error-banner">{error}</div>}

      {listState === 'done' && sessions.length === 0 && (
        <p className="hint">
          No sessions yet. Record one from Home and it will appear here.
        </p>
      )}

      {listState === 'done' && sessions.length > 0 && (
        <div className="review-split">
          <nav className="session-list" aria-label="Past sessions">
            {groups.map((group) => (
              <div key={group.key} className="day-group">
                <h2>{group.label}</h2>
                {group.items.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    className={`session-item ${session.id === selectedId ? 'is-selected' : ''}`}
                    onClick={() => select(session.id)}
                    aria-current={session.id === selectedId}
                  >
                    <span className="session-label">{labelFor(session)}</span>
                    <span className="session-meta">
                      {timeOf(session.timestamp)}
                      {session.task_count > 0 && ` · ${session.task_count} task${session.task_count === 1 ? '' : 's'}`}
                      {session.fact_count > 0 && ` · ${session.fact_count} fact${session.fact_count === 1 ? '' : 's'}`}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="session-detail">
            {detailState === 'idle' && (
              <p className="hint">Choose a session to see what it produced.</p>
            )}

            {detailState === 'loading' && (
              <div className="working">
                <span className="pulse" aria-hidden="true" />
                <span>Loading the session…</span>
              </div>
            )}

            {detailState === 'error' && <div className="error-banner">{error}</div>}

            {detailState === 'done' && detail && (
              <>
                <button type="button" className="back-to-list" onClick={() => setSelectedId(null)}>
                  ← All sessions
                </button>

                <p className="detail-date">
                  {new Date(detail.timestamp).toLocaleDateString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {' · '}
                  {timeOf(detail.timestamp)}
                </p>

                {detail.summary ? (
                  <div className="detail-summary">
                    <Markdown text={detail.summary} />
                  </div>
                ) : (
                  <p className="hint">
                    No summary was generated for this session — extraction either failed or
                    never ran.
                  </p>
                )}

                <Records items={detail.tasks} kind="task" label="Tasks" empty="None extracted." />
                <Records items={detail.facts} kind="fact" label="Key facts" empty="None extracted." />

                <details>
                  <summary>Raw transcript</summary>
                  <div className="transcript-box">
                    {detail.transcript || '(empty — no speech captured)'}
                  </div>
                </details>
              </>
            )}
          </div>
        </div>
      )}

      <div className="controls-row">
        <button className="secondary" onClick={onBack}>Back to Home</button>
      </div>
    </div>
  )
}
