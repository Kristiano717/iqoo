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
  // onnxruntime-web (pulled in by both the VAD and Transformers.js) loads
  // its wasm backend through a dynamic import. Vite's dep pre-bundler
  // rewrites that import into .vite/deps/, where the wasm glue no longer
  // resolves — the symptom is "no available backend found. ERR: [wasm]
  // Failed to fetch dynamically imported module". Excluding these keeps
  // them as real ESM so the runtime resolves its own assets.
  optimizeDeps: {
    exclude: ['onnxruntime-web', '@ricky0123/vad-web', '@huggingface/transformers'],
  },
})
