import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Registered only so Chrome treats the app as installable and builds a real
// WebAPK on "Add to Home Screen" — an installed app is what Android's
// floating-window switcher can pick up. The worker itself caches nothing
// (see public/sw.js). Registration silently no-ops on insecure origins, so
// this is safe on plain-HTTP localhost.
// Whisper's ~152MB of weights live in Cache Storage (transformers.js uses the
// Cache API), which is genuinely on-disk and offline-capable — but evictable
// by default when the device is low on space. Asking for persistent storage
// is what turns "cached" into "stored": without it the phone can silently
// drop the model and re-download it, which on a venue's wifi is a dead demo.
// Installed PWAs are usually granted this automatically; a plain browser tab
// may be denied, which is harmless.
if (navigator.storage?.persist) {
  navigator.storage
    .persisted()
    .then((already) => (already ? null : navigator.storage.persist()))
    .catch(() => {})
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed; app still works, but it will not be installable.', err)
    })
  })
}
