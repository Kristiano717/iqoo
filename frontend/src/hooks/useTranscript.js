import { useSpeechTranscript } from './useSpeechTranscript.js'
import { useWhisperTranscript } from './useWhisperTranscript.js'

// Engine switch. Both hooks return the same shape, so screens depend on
// this and never on a specific engine.
//
// 'whisper' — on-device (Transformers.js + Silero VAD). Nothing leaves the
//   device, works offline once the model is cached, ~2s after a pause.
// 'webspeech' — Chrome's cloud recognition. Near-instant with word-by-word
//   interim text, but sends audio to Google and needs a network.
//
// Kept switchable deliberately: Whisper is the target, but if the model
// misbehaves on unfamiliar hardware there's a known-good fallback that
// doesn't require a code change under demo pressure.
export const ENGINES = ['whisper', 'webspeech']

// Both hooks are called unconditionally — React requires a stable hook
// order, so the inactive engine still mounts. Neither touches the mic until
// start() is called, and Whisper's `enabled` flag keeps it from loading its
// worker and model machinery unless it's the engine actually in use.
export function useTranscript(engine) {
  const speech = useSpeechTranscript()
  const whisper = useWhisperTranscript(engine === 'whisper')
  return engine === 'webspeech' ? speech : whisper
}
