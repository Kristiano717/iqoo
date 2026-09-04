// Second line of defence against transcribing the other person twice.
//
// On speakerphone their voice reaches the microphone as well as the tab
// stream, so the same sentence can arrive on both. The first line of defence
// is acoustic — the mic is captured with echoCancellation enabled — but AEC
// is imperfect at high volume or through an external speaker, so anything it
// misses gets caught here on the text.
//
// The rule is deliberately directional: only a *microphone* segment is ever
// discarded, and only when it matches something the *remote* stream already
// produced. The tab-audio original is never touched. That asymmetry is what
// makes this safe — the worst case is a duplicate slipping through, never the
// other participant's words going missing.

// How far back to look. An acoustic echo reaches the mic within milliseconds;
// the spread here comes from the two streams being transcribed by separate
// sessions that commit segments at slightly different moments.
export const ECHO_WINDOW_MS = 4000

// Similarity above which two segments are considered the same utterance.
// Not 1.0: the echo travels through a speaker and back through a microphone,
// so it is transcribed from degraded audio and rarely comes back word for word.
export const SIMILARITY_THRESHOLD = 0.75

// A short candidate fully contained in a longer remote segment is an echo of
// part of it — the mic caught only a fragment. Held higher than the Dice
// threshold because containment is a weaker signal on its own.
export const CONTAINMENT_THRESHOLD = 0.9

// Below this, don't dedupe at all. Both people genuinely say "yeah", "right"
// and "okay" constantly, and wrongly deleting the user's own short reply is a
// worse failure than letting a short echo through.
export const MIN_WORDS = 3

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function words(text) {
  const n = normalize(text)
  return n ? n.split(' ') : []
}

/** Word bigrams — falls back to unigrams for one-word input. */
function bigrams(tokens) {
  if (tokens.length < 2) return tokens.slice()
  const out = []
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`)
  return out
}

/**
 * Overlap between two strings, as {dice, containment}, both 0..1.
 *
 * Bigrams rather than single words because word order matters here: "we ship
 * on Friday" and "Friday we ship on" share every word but are different
 * utterances. Counted as a multiset so a repeated phrase can't inflate the
 * score by matching the same bigram twice.
 */
export function overlap(a, b) {
  const ga = bigrams(words(a))
  const gb = bigrams(words(b))
  if (ga.length === 0 || gb.length === 0) return { dice: 0, containment: 0 }

  const remaining = new Map()
  for (const g of ga) remaining.set(g, (remaining.get(g) || 0) + 1)

  let shared = 0
  for (const g of gb) {
    const count = remaining.get(g) || 0
    if (count > 0) {
      shared++
      remaining.set(g, count - 1)
    }
  }

  return {
    dice: (2 * shared) / (ga.length + gb.length),
    containment: shared / Math.min(ga.length, gb.length),
  }
}

/**
 * Is this microphone segment an echo of something the remote stream said?
 *
 * @param {string} candidate           text just finalized on the mic stream
 * @param {Array<{text:string,at:number}>} recentRemote  remote segments, newest last
 * @param {number} now                 timestamp to measure the window against
 */
export function isEcho(candidate, recentRemote, now = Date.now()) {
  const tokens = words(candidate)
  if (tokens.length < MIN_WORDS) return false

  for (const remote of recentRemote) {
    if (now - remote.at > ECHO_WINDOW_MS) continue
    const { dice, containment } = overlap(candidate, remote.text)
    if (dice >= SIMILARITY_THRESHOLD || containment >= CONTAINMENT_THRESHOLD) {
      return true
    }
  }
  return false
}
