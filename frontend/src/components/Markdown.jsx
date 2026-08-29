// Minimal markdown renderer for LLM answers.
//
// The model returns markdown (headings, bullets, bold) and rendering it as
// raw text shows literal "###" and "**" to the user. A full markdown
// library is more than this needs — the model only ever produces these
// four constructs, so ~50 lines covers it without a dependency.
//
// Builds React elements rather than setting innerHTML, so model output
// can't inject markup.

const BOLD_SPLIT = /(\*\*[^*]+\*\*)/g

// "Send the **deck** today" -> ["Send the ", <strong>deck</strong>, " today"]
function renderInline(text, keyPrefix) {
  return text.split(BOLD_SPLIT).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-b${i}`}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const BULLET_RE = /^\s*[-*]\s+(.*)$/
const RULE_RE = /^\s*-{3,}\s*$/

export default function Markdown({ text }) {
  const lines = (text || '').split('\n')
  const blocks = []
  let bullets = []

  // Bullets arrive as consecutive lines; collect them so they render as one
  // <ul> rather than a series of orphaned list items.
  const flushBullets = () => {
    if (bullets.length === 0) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="md-list">
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>,
    )
    bullets = []
  }

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()

    if (!line.trim() || RULE_RE.test(line)) {
      flushBullets()
      return
    }

    const bullet = line.match(BULLET_RE)
    if (bullet) {
      bullets.push(bullet[1])
      return
    }

    flushBullets()

    const heading = line.match(HEADING_RE)
    if (heading) {
      blocks.push(
        <h3 key={`h-${idx}`} className="md-heading">
          {renderInline(heading[2], `h-${idx}`)}
        </h3>,
      )
      return
    }

    blocks.push(
      <p key={`p-${idx}`} className="md-para">
        {renderInline(line, `p-${idx}`)}
      </p>,
    )
  })

  flushBullets()

  return <div className="md">{blocks}</div>
}
