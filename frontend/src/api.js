// Single place for the backend base URL — avoids hardcoding it in every
// screen. Keep in sync with the port uvicorn is started on, and with the
// CORS allowlist in backend/main.py.
//
// Gotcha worth knowing when a backend change doesn't seem to take effect:
// `uvicorn --reload` spawns a child worker, and killing only the parent
// reloader PID leaves that worker orphaned and still bound to the port,
// happily serving the OLD code. Windows keeps attributing the socket to
// the dead parent's PID, so it looks like a phantom listener. In this
// venv the workers are named `python3.11.exe` (not `python.exe`), which
// makes them easy to miss. Kill the workers by name, not just the PID
// uvicorn printed.
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
