import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Port pinned to 5175 (not the 5173 default) because another local project
// on this machine already occupies 5173, which was silently bumping this
// app to a different port on every restart.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,

    // Bind every interface. Vite's default binds the hostname "localhost",
    // which on this machine resolves to ::1 only — so http://127.0.0.1:5175
    // is refused, with nothing in the Vite log to explain it.
    host: true,

    // The frontend calls /api/... rather than an absolute
    // http://localhost:8000 (see src/api.js), so every request is
    // same-origin and CORS never applies. In production the same /api path
    // is rewritten to the deployed backend by vercel.json — meaning dev and
    // prod share one code path and the frontend never learns the backend's
    // real URL.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
