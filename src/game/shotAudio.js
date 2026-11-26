let audioContext;
let noiseBuffer;

export function playShotSound() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    return;
  }

  audioContext ??= new AudioContextConstructor();
  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }

  if (!noiseBuffer) {
    noiseBuffer = audioContext.createBuffer(1, Math.ceil(audioContext.sampleRate * 0.07), audioContext.sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * (1 - index / channel.length);
    }
  }

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const toneGain = audioContext.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(145, now);
  oscillator.frequency.exponentialRampToValueAtTime(55, now + 0.09);
  toneGain.gain.setValueAtTime(0.11, now);
  toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
  oscillator.connect(toneGain);
  toneGain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.12);

  const noise = audioContext.createBufferSource();
  const noiseFilter = audioContext.createBiquadFilter();
  const noiseGain = audioContext.createGain();
  noise.buffer = noiseBuffer;
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 1800;
  noiseGain.gain.setValueAtTime(0.12, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioContext.destination);
  noise.start(now);
  noise.stop(now + 0.07);
}
