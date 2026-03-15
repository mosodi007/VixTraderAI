/**
 * Sound alert for new signals using an HTML5 Audio element and an inline WAV beep.
 * Playing once when the user turns "Sound alert" ON unlocks the element for later plays
 * (no Web Audio / suspended context issues).
 */

const BEEP_DURATION_SEC = 0.15;
const BEEP_FREQ = 800;
const SAMPLE_RATE = 44100;

function buildBeepWavDataUrl(): string {
  const numSamples = Math.floor(SAMPLE_RATE * BEEP_DURATION_SEC);
  const dataSize = numSamples * 2;
  const numBytes = 44 + dataSize;
  const buffer = new ArrayBuffer(numBytes);
  const view = new DataView(buffer);
  let pos = 0;

  const writeStr = (str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(pos + i, str.charCodeAt(i));
    pos += str.length;
  };

  writeStr('RIFF');
  view.setUint32(pos, numBytes - 8, true);
  pos += 4;
  writeStr('WAVE');
  writeStr('fmt ');
  view.setUint32(pos, 16, true);
  pos += 4;
  view.setUint16(pos, 1, true);
  pos += 2;
  view.setUint16(pos, 1, true);
  pos += 2;
  view.setUint32(pos, SAMPLE_RATE, true);
  pos += 4;
  view.setUint32(pos, SAMPLE_RATE * 2, true);
  pos += 4;
  view.setUint16(pos, 2, true);
  pos += 2;
  view.setUint16(pos, 16, true);
  pos += 2;
  writeStr('data');
  view.setUint32(pos, dataSize, true);
  pos += 4;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const sample = Math.sin(2 * Math.PI * BEEP_FREQ * t) * 0.3;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    view.setInt16(pos + i * 2, intSample, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(binary);
}

let beepDataUrl: string | null = null;
let audioEl: HTMLAudioElement | null = null;

function getBeepAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!beepDataUrl) beepDataUrl = buildBeepWavDataUrl();
  if (!audioEl) {
    audioEl = new Audio(beepDataUrl);
    audioEl.volume = 0.7;
  }
  return audioEl;
}

/**
 * Call when the user enables sound (e.g. toggles "Sound alert" ON).
 * Plays the beep once so the Audio element is unlocked for later plays.
 */
export function unlockAudio(): void {
  const audio = getBeepAudio();
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

/**
 * Unlock the Audio element without playing an audible sound (e.g. when tab becomes visible).
 * Keeps programmatic play working for new-signal alerts without beeping on tab focus.
 */
export function unlockAudioSilent(): void {
  const audio = getBeepAudio();
  if (!audio) return;
  const savedVolume = audio.volume;
  audio.volume = 0;
  audio.currentTime = 0;
  // Ensure volume 0 is applied before play (avoids a brief audible peep in some browsers)
  const playSilent = () => {
    audio.play().catch(() => {}).finally(() => {
      audio.volume = savedVolume;
    });
  };
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(playSilent);
  } else {
    playSilent();
  }
}

/**
 * Play the alert sound. Works best after unlockAudio() was called once (e.g. when user turned Sound alert ON).
 * Uses the same Audio element so it can play without a new user gesture in most browsers.
 */
export function playNewSignalAlert(): void {
  const audio = getBeepAudio();
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}
