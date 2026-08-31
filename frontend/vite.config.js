import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Minimal Vite config. Port pinned to 5175 (not the 5173 default) because
// another local project on this machine already occupies 5173, which was
// silently bumping this app to a different port on every restart.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,

    // Bind every interface. Vite's default binds the hostname
    // "localhost", which on this machine resolves to ::1 only — so
    // http://127.0.0.1:5175 is refused, and a tunnel client pointed at
    // the IPv4 loopback fails with nothing in the Vite log to explain it.
    host: true,

    // The frontend talks to FastAPI through this proxy rather than at an
    // absolute http://localhost:8000 (see src/api.js). Two reasons, both
    // about running on a phone: "localhost" on the phone is the *phone*, and
    // a page served over HTTPS through a tunnel cannot call a plain-HTTP
    // origin (mixed content). Proxying makes every API call same-origin, so
    // one tunnel covers the whole app and CORS stops mattering entirely.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },

    // Vite 5.4.12+ rejects requests whose Host header it doesn't recognise,
    // which would otherwise answer every tunnel URL with "Blocked request".
    // Listed by suffix (a leading dot matches subdomains) rather than opened
    // up with `true`.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.loca.lt'],
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
