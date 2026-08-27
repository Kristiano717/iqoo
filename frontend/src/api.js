// Single place for the backend base URL — avoids hardcoding it in every
// screen. Port 8001, not FastAPI/uvicorn's 8000 default: a prior dev
// server left Windows in a stuck state on 8000 (two PIDs simultaneously
// LISTENING per netstat, neither killable, neither a live process per
// Get-Process — stale kernel-level TCP state, not an app bug). Moved off
// it rather than debug OS socket internals. Keep this in sync with the
// `uvicorn main:app --port 8001` command backend is started with.
const API_BASE = 'http://localhost:8001'

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

export async function saveTasks(sessionId, tasks) {
  if (tasks.length === 0) return { saved: 0 }
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Task save failed (${res.status}): ${body}`)
  }
  return res.json() // { saved }
}
