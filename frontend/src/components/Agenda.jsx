import { useEffect, useState } from 'react'
import { fetchSessions } from '../api.js'
import { collectDatedRecords } from '../lib/dates.js'
import { overlap } from '../lib/echoDedupe.js'

// What the meetings committed to, ahead of you rather than behind.
//
// Every other screen looks backwards — recall answers questions about the
// past, review browses it. This is the same memory read forwards: the days
// that were promised something, gathered from every session at once.
//
// Nothing new is stored to build it. Each session already carries its tasks
// and facts, and dates.js already resolves a commitment to a real day; this
// only does that across sessions instead of within one, and keeps the ones
// that haven't happened yet.
//
// Renders null when there is nothing coming up, so a first-time Home stays a
// landing page rather than an empty dashboard.

const MAX_DAYS = 8

// Extraction and the wake phrase both write tasks, so one commitment often
// arrives several times over: the raw spoken capture, the model's tidied
// version, and the same thing again as a fact. Exact-match deduping doesn't
// touch them because the wording differs. Bigram similarity does.
//
// Tuned to merge rewordings of one commitment while leaving genuinely
// different ones alone — "Get the budget discount on February 5th" and
// "Schedule a meeting on February 5th" share a date and nothing else, and
// must both survive. Under-merging is the safer error.
const SAME_COMMITMENT_DICE = 0.55
const SAME_COMMITMENT_CONTAINMENT = 0.8

function sameCommitment(a, b) {
  const { dice, containment } = overlap(a, b)
  return dice >= SAME_COMMITMENT_DICE || containment >= SAME_COMMITMENT_CONTAINMENT
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** Upcoming commitments across sessions, grouped by the day they fall on. */
export function upcomingFrom(sessions, from = startOfToday()) {
  const byDay = new Map()

  for (const session of sessions) {
    const records = [...(session.tasks || []), ...(session.facts || [])]
    // Resolved against when *that* meeting happened — "Friday" in an old
    // session means that Friday, not this week's.
    for (const entry of collectDatedRecords(records, session.timestamp)) {
      if (entry.date < from) continue
      const key = entry.date.toDateString()
      if (!byDay.has(key)) byDay.set(key, { date: entry.date, items: [] })
      const day = byDay.get(key)
      for (const item of entry.items) {
        const existing = day.items.findIndex((i) => sameCommitment(i.text, item.text))
        if (existing === -1) {
          day.items.push({ text: item.text, sessionId: session.id, sessionAt: session.timestamp })
        } else if (item.text.length < day.items[existing].text.length) {
          // Keep the tersest wording of a commitment. The raw wake-phrase
          // capture is usually a run-on sentence carrying three separate
          // promises; the model's rewrite of it is the readable one.
          day.items[existing] = {
            text: item.text,
            sessionId: session.id,
            sessionAt: session.timestamp,
          }
        }
      }
    }
  }

  return [...byDay.values()].sort((a, b) => a.date - b.date).slice(0, MAX_DAYS)
}

function relativeDay(date, from = startOfToday()) {
  const days = Math.round((date - from) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' })
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Agenda({ onOpenSession }) {
  const [days, setDays] = useState([])

  useEffect(() => {
    let cancelled = false
    fetchSessions()
      .then((sessions) => {
        if (!cancelled) setDays(upcomingFrom(sessions))
      })
      // Silent: this is a bonus panel on the landing page, and a failure
      // here must not put an error banner in front of someone who just
      // wanted to start a session.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (days.length === 0) return null

  return (
    <section className="agenda">
      <h2>Coming up</h2>
      <ul className="agenda-days">
        {days.map((day) => (
          <li key={day.date.toDateString()}>
            <div className="agenda-when">
              <span className="agenda-rel">{relativeDay(day.date)}</span>
              <span className="agenda-date">
                {day.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </span>
            </div>
            <ul className="agenda-items">
              {day.items.map((item, i) => (
                <li key={i}>
                  <button type="button" onClick={() => onOpenSession?.(item.sessionId)}>
                    <span className="agenda-text">{item.text}</span>
                    <span className="agenda-source">
                      from{' '}
                      {new Date(item.sessionAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}
