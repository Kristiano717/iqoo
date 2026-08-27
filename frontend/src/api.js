// Single place for the backend base URL — avoids hardcoding it in every
// screen. Change here (and in backend/main.py's CORS allowlist) if the
// backend port ever moves off 8000.
const API_BASE = 'http://localhost:8000'

export async function saveSession(transcript) {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Save failed (${res.status}): ${body}`)
  }
  return res.json() // { id, timestamp }
}
