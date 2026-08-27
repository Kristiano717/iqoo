// Wake-phrase task detection — simple regex match on the transcript stream.
// Per CLAUDE.md: this is NOT a second AI model, just string matching. Kept
// deliberately loose (comma optional, case-insensitive) because the Web
// Speech API rarely inserts punctuation into its output.
const WAKE_PHRASE_RE = /hey\s+coworker,?\s+remind me to\s+(.+)/i

// Returns the captured task text, or null if the segment doesn't contain
// the wake phrase. Strips a trailing sentence-ending punctuation mark.
export function extractTask(segment) {
  const match = segment.match(WAKE_PHRASE_RE)
  if (!match) return null
  const task = match[1].trim().replace(/[.!?]+$/, '').trim()
  return task || null
}
