import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Minimal Vite config. Port pinned to 5175 (not the 5173 default) because
// another local project on this machine already occupies 5173, which was
// silently bumping this app to a different port on every restart. The
// FastAPI backend's CORS allowlist (backend/main.py) is set to match this.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
  },
})
