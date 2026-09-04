// Finds dates that were actually spoken about in a session.
//
// Meetings commit to time constantly — "before Friday", "moved to Q3",
// "I'll send it tomorrow" — and that's precisely the detail people fail to
// carry forward. The extracted records keep the words; this turns the ones
// that name a real day into dates you can see on a calendar.
//
// Resolution is relative to when the session happened, not to now. "Friday"
// said three weeks ago means a Friday three weeks ago, and showing today's
// Friday instead would be worse than showing nothing.
//
// Deliberately conservative: only patterns that resolve to one unambiguous
// day are returned. "Next quarter", "end of the month" and "Q3" name real
// commitments but not single days, so they're left alone rather than guessed
// at — a calendar that invents a deadline is worse than one that omits it.

const WEEKDAYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
]

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

/** Midnight local, so comparisons are day-level and never time-of-day. */
function atMidnight(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function monthKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}`
}

/**
 * The next time this weekday comes round, counting the reference day itself.
 * "Due Friday" said on a Friday means that day, not a week later.
 */
function nextWeekday(reference, targetDow) {
  const delta = (targetDow - reference.getDay() + 7) % 7
  return addDays(reference, delta)
}

/**
 * A month/day pair resolved into a year. Meetings talk about the near
 * future far more than the near past, so a date that would land well behind
 * the session is read as next year instead.
 */
function resolveMonthDay(reference, monthIndex, day) {
  let candidate = new Date(reference.getFullYear(), monthIndex, day)
  candidate.setHours(0, 0, 0, 0)
  const daysBehind = (reference - candidate) / 86400000
  if (daysBehind > 180) candidate = new Date(reference.getFullYear() + 1, monthIndex, day)
  return candidate
}

const MONTH_NAMES = MONTHS.join('|')

// Order matters: the most specific patterns run first so "April 6th" isn't
// consumed by a bare month match.
const PATTERNS = [
  {
    // 2026-04-06
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/gi,
    resolve: (m) => {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      d.setHours(0, 0, 0, 0)
      return Number.isNaN(d.getTime()) ? null : d
    },
  },
  {
    // April 6, April 6th, April 6th 2026
    re: new RegExp(`\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'gi'),
    resolve: (m, ref) => {
      const day = Number(m[2])
      if (day < 1 || day > 31) return null
      return resolveMonthDay(ref, MONTHS.indexOf(m[1].toLowerCase()), day)
    },
  },
  {
    // 6 April, 6th of April
    re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAMES})\\b`, 'gi'),
    resolve: (m, ref) => {
      const day = Number(m[1])
      if (day < 1 || day > 31) return null
      return resolveMonthDay(ref, MONTHS.indexOf(m[2].toLowerCase()), day)
    },
  },
  {
    re: /\btomorrow\b/gi,
    resolve: (_m, ref) => addDays(ref, 1),
  },
  {
    re: /\btoday\b/gi,
    resolve: (_m, ref) => new Date(ref),
  },
  {
    re: /\byesterday\b/gi,
    resolve: (_m, ref) => addDays(ref, -1),
  },
  {
    // "next Tuesday" resolves a week beyond the plain weekday reading.
    re: new RegExp(`\\bnext\\s+(${WEEKDAYS.join('|')})\\b`, 'gi'),
    resolve: (m, ref) => addDays(nextWeekday(ref, WEEKDAYS.indexOf(m[1].toLowerCase())), 7),
  },
  {
    re: new RegExp(`\\b(${WEEKDAYS.join('|')})\\b`, 'gi'),
    resolve: (m, ref) => nextWeekday(ref, WEEKDAYS.indexOf(m[1].toLowerCase())),
  },
]

/**
 * Every resolvable date mentioned in `text`.
 *
 * @param {string} text          the record's wording
 * @param {Date|string} sessionAt when the meeting happened
 * @returns {Array<{date: Date, phrase: string}>}
 */
export function findDates(text, sessionAt) {
  if (!text) return []
  const reference = atMidnight(new Date(sessionAt))
  if (Number.isNaN(reference.getTime())) return []

  const found = []
  // Character spans already claimed, so "April 6th" isn't also counted as a
  // bare month and a bare number.
  const claimed = []
  const overlaps = (start, end) => claimed.some(([s, e]) => start < e && end > s)

  for (const { re, resolve } of PATTERNS) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(text)) !== null) {
      const start = match.index
      const end = start + match[0].length
      if (overlaps(start, end)) continue
      const date = resolve(match, reference)
      if (!date || Number.isNaN(date.getTime())) continue
      claimed.push([start, end])
      found.push({ date, phrase: match[0] })
    }
  }

  return found.sort((a, b) => a.date - b.date)
}

/**
 * Dates across a session's records, each carrying what was said about it.
 * One entry per day: two commitments on the same Friday are one marked day
 * with both items attached.
 *
 * @param {string[]} records      task and fact strings
 * @param {Date|string} sessionAt
 */
export function collectDatedRecords(records, sessionAt) {
  const byDay = new Map()

  for (const record of records) {
    for (const { date, phrase } of findDates(record, sessionAt)) {
      const key = date.toDateString()
      if (!byDay.has(key)) byDay.set(key, { date, items: [] })
      const entry = byDay.get(key)
      // The same record can name a day twice ("Friday … by Friday"); it
      // should still appear once against that day.
      if (!entry.items.some((i) => i.text === record)) {
        entry.items.push({ text: record, phrase })
      }
    }
  }

  return [...byDay.values()].sort((a, b) => a.date - b.date)
}
