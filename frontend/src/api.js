// Single place for the backend base URL.
//
// This is a same-origin path, not http://localhost:8000, because the Vite
// dev server proxies /api to FastAPI (see vite.config.js). That indirection
// is what lets the app run on a phone: "localhost" there means the phone
// itself, and an HTTPS tunnel URL can't call a plain-HTTP origin anyway.
// One consequence worth knowing — the backend must be reached through Vite,
// so hitting the frontend without uvicorn running gives 502s from the proxy
// rather than connection errors.
//
// Gotcha worth knowing when a backend change doesn't seem to take effect:
// `uvicorn --reload` spawns a child worker, and killing only the parent
// reloader PID leaves that worker orphaned and still bound to the port,
// happily serving the OLD code. Windows keeps attributing the socket to
// the dead parent's PID, so it looks like a phantom listener. In this
// venv the workers are named `python3.11.exe` (not `python.exe`), which
// makes them easy to miss. Kill the workers by name, not just the PID
// uvicorn printed.
const API_BASE = '/api'

export async function fetchLiveToken() {
  // One token per WebSocket, requested immediately before connecting — they
  // are single-use and expire in minutes, so they can't be cached.
  const res = await fetch(`${API_BASE}/live-token`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Could not start live transcription (${res.status}): ${body}`)
  }
  return res.json() // { token, model }
}

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

export async function summarizeSession(sessionId) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/summarize`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Summarize failed (${res.status}): ${body}`)
  }
  return res.json() // { summary, tasks, facts }
}

export async function askRecall(question) {
  const res = await fetch(`${API_BASE}/recall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Recall failed (${res.status}): ${body}`)
  }
  return res.json() // { answer, sessions_searched }
}
