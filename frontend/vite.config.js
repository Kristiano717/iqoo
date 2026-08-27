import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Minimal Vite config. Dev server on 5173 (Vite default) — the FastAPI
// backend's CORS allowlist (backend/main.py) is set to match this.
export default defineConfig({
  plugins: [react()],
})
