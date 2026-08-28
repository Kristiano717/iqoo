// Wake-phrase task detection — simple regex match on the transcript stream.
// Per CLAUDE.md: this is NOT a second AI model, just string matching. Kept
// deliberately loose (comma optional, case-insensitive) because the Web
// Speech API rarely inserts punctuation into its output.
//
// The capture group is [^\n]+ rather than .+ on purpose: callers join
// finalized transcript chunks with '\n' (see LiveSession), so the task
// text can never bleed past the chunk it was spoken in, no matter how
// much more gets said afterwards.
// Built loose on purpose. The Web Speech API decides its own spelling and
// punctuation, and it renders this phrase inconsistently — "coworker",
// "co-worker" and "co worker" all show up, as do stray commas ("Hey,
// coworker, remind me..."). A strict pattern silently captures nothing,
// which during a live demo looks like the whole feature is broken. Each
// piece below absorbs one of those variations:
//   hey[,]?          - optional comma after the greeting
//   co[-\s]?worker   - the three spellings the recognizer produces
//   (?:please\s+)?   - "hey coworker, please remind me to..."
//   remind me (?:to|that i need to) - the two phrasings people actually say
const WAKE_PHRASE_SOURCE =
  /hey,?\s+co[-\s]?worker,?\s+(?:please\s+)?remind me (?:to|that i need to)\s+([^\n]+)/
const WAKE_PHRASE_RE = new RegExp(WAKE_PHRASE_SOURCE.source, 'i')
const WAKE_PHRASE_RE_GLOBAL = new RegExp(WAKE_PHRASE_SOURCE.source, 'gi')

function cleanTask(raw) {
  const task = raw.trim().replace(/[.!?]+$/, '').trim()
  return task || null
}

// Returns the captured task text, or null if the text doesn't contain the
// wake phrase. Used for one-off checks (e.g. tests); LiveSession itself
// uses findAllWakePhraseMatches for live detection.
export function extractTask(text) {
  const match = text.match(WAKE_PHRASE_RE)
  if (!match) return null
  return cleanTask(match[1])
}

// Finds every wake-phrase occurrence in `text`, each with the character
// offset (within `text`) where it starts. Callers re-scan the full,
// growing transcript on every update and use `start` to dedupe — since
// finalized chunks are never edited after being appended, a match's start
// offset is stable once it first appears, so tracking "have I already
// accepted a match at this start?" is enough to fire each real match
// exactly once, however many times the surrounding text gets re-scanned.
export function findAllWakePhraseMatches(text) {
  const matches = []
  for (const m of text.matchAll(WAKE_PHRASE_RE_GLOBAL)) {
    const task = cleanTask(m[1])
    if (task) matches.push({ task, start: m.index })
  }
  return matches
}
