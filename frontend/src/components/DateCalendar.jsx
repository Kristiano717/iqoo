import { collectDatedRecords, isSameDay, monthKey } from '../lib/dates.js'

// The dates a session committed to, shown as a calendar.
//
// Renders nothing at all when no record resolves to a real day — a meeting
// that set no deadlines should show no calendar, not an empty month. That
// check lives here rather than in each caller.
//
// Only unambiguous days are marked. "Launch in March" and "moved to Q3" are
// real commitments but not single dates, and a calendar that invents a
// deadline is worse than one that stays quiet (see lib/dates.js).

// A session that ranged over half a year shouldn't produce an endless strip
// of month grids.
const MAX_MONTHS = 3

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Day cells for a month, padded so the 1st lands under the right weekday. */
function monthCells(year, month) {
  const first = new Date(year, month, 1)
  // JS weeks start Sunday; this calendar starts Monday.
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: lead }, () => null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day))
  return cells
}

export default function DateCalendar({ records, sessionAt }) {
  const dated = collectDatedRecords(records || [], sessionAt)
  if (dated.length === 0) return null

  const sessionDay = new Date(sessionAt)

  // One grid per month that actually holds a date, in chronological order.
  const months = []
  for (const entry of dated) {
    const key = monthKey(entry.date)
    if (!months.some((m) => m.key === key)) {
      months.push({ key, year: entry.date.getFullYear(), month: entry.date.getMonth() })
    }
  }

  const marked = dated.map((d) => d.date)

  return (
    <section className="tray dates">
      <h2>
        Dates mentioned <span className="count">{dated.length}</span>
      </h2>

      <div className="cal-months">
        {months.slice(0, MAX_MONTHS).map(({ key, year, month }) => (
          <div className="cal" key={key}>
            <div className="cal-title">
              {new Date(year, month, 1).toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </div>
            <div className="cal-grid">
              {WEEKDAY_INITIALS.map((initial, i) => (
                <span className="cal-dow" key={i} aria-hidden="true">
                  {initial}
                </span>
              ))}
              {monthCells(year, month).map((day, i) =>
                day === null ? (
                  <span className="cal-day is-empty" key={`pad-${i}`} />
                ) : (
                  <span
                    key={day.toDateString()}
                    className={[
                      'cal-day',
                      marked.some((m) => isSameDay(m, day)) ? 'is-marked' : '',
                      isSameDay(sessionDay, day) ? 'is-session' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {day.getDate()}
                  </span>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      {/* The grid says when; this says what was promised. */}
      <ul className="cal-items">
        {dated.map((entry) => (
          <li key={entry.date.toDateString()}>
            <span className="cal-when">
              {entry.date.toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </span>
            <span className="cal-what">
              {entry.items.map((item, i) => (
                <span key={i}>{item.text}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
