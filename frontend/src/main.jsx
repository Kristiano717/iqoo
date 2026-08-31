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
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed; app still works, but it will not be installable.', err)
    })
  })
}
