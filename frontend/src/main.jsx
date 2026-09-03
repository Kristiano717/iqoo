import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Registered only so the browser treats the app as installable and builds a
// real app entry on "Add to Home Screen" rather than a bookmark shortcut.
// The worker itself caches nothing (see public/sw.js) — a caching worker on
// a prototype means serving yesterday's bundle during a demo, which is a
// worse failure than having no offline support. Registration silently
// no-ops on insecure origins, so this is safe on plain-HTTP localhost.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed; app still works, but it will not be installable.', err)
    })
  })
}
