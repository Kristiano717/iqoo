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
  // NOTE: do not add @ricky0123/vad-web or @huggingface/transformers to
  // optimizeDeps.exclude. Both ship CommonJS, and Vite's pre-bundler is
  // what converts that to ESM for the browser — excluding them serves raw
  // `exports`/`require` to the page, which throws at module load and
  // renders a blank app. Tried it; that's exactly what happened.
  //
  // The onnxruntime wasm path is handled at the call site instead (see
  // useWhisperTranscript.js) rather than through bundler config.
})
