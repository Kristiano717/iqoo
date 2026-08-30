// A list of extracted memory objects, rendered as tagged records rather
// than bullets. The visual point is the product's actual claim: a session
// becomes structured entries, not a paragraph you have to re-read.
//
// `kind` picks the tag colour — task / fact / live (wake-phrase capture).
export default function Records({ items, kind = 'task', label, empty }) {
  return (
    <div className="tray">
      <h2>
        {label} {items.length > 0 && <span className="count">{items.length}</span>}
      </h2>
      {items.length === 0 ? (
        <p className="hint">{empty}</p>
      ) : (
        <ul className={`records is-${kind}`}>
          {items.map((text, i) => (
            // Stagger so a burst of records reads as a sequence rather than
            // a single block appearing.
            <li key={i} style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}>
              <span className="tag">{kind === 'fact' ? 'fact' : 'task'}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
