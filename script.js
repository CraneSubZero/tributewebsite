const musicButton = document.querySelector("#music-toggle");
const musicLabel = document.querySelector(".music-label");
const musicAnnouncement = document.querySelector("#music-announcement");

if (musicButton instanceof HTMLButtonElement) {
  const tempo = 76;
  const beatLength = 60 / tempo;
  const chordProgression = [
    [50, 54, 57, 61],
    [45, 49, 52, 55],
    [46, 50, 53, 57],
    [41, 45, 48, 51],
  ];
  let audioContext;
  let masterGain;
  let noiseBuffer;
  let nextStepTime = 0;
  let step = 0;
  let scheduler;
  let playing = false;

  function makeNoiseBuffer(context) {
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    let lastValue = 0;

    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      lastValue = (lastValue + 0.02 * white) / 1.02;
      data[index] = lastValue * 3.5;
    }

    return buffer;
  }

  function setupAudio() {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) {
      throw new Error("Web Audio is not supported by this browser.");
    }

    audioContext = new AudioContextConstructor();
    masterGain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    const compressor = audioContext.createDynamicsCompressor();

    filter.type = "lowpass";
    filter.frequency.value = 3600;
    filter.Q.value = 0.6;
    compressor.threshold.value = -20;
    compressor.ratio.value = 3;
    masterGain.gain.value = 0;
    masterGain.connect(filter);
    filter.connect(compressor);
    compressor.connect(audioContext.destination);
    noiseBuffer = makeNoiseBuffer(audioContext);
  }

  function midiToFrequency(note) {
    return 440 * 2 ** ((note - 69) / 12);
  }

  function playTone(frequency, start, duration, volume, type = "triangle", endFrequency = frequency) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.025, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function playNoise(start, duration, volume, frequency, type = "bandpass") {
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();

    source.buffer = noiseBuffer;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  function playChord(start, notes) {
    notes.forEach((note, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const duration = beatLength * 3.8;

      oscillator.type = "triangle";
      oscillator.frequency.value = midiToFrequency(note + 12);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.015, start + 0.18 + index * 0.035);
      gain.gain.setValueAtTime(0.015, start + duration - 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    });
  }

  function scheduleStep() {
    const currentStep = step % 32;
    const beatInBar = currentStep % 8;
    const time = nextStepTime;

    if (beatInBar === 0) {
      const chord = chordProgression[Math.floor(currentStep / 8)];
      playChord(time, chord);
      playTone(midiToFrequency(chord[0] - 12), time, beatLength * 1.7, 0.09, "sine");
    }

    if (beatInBar % 2 === 0) {
      const beatInMeasure = Math.floor(beatInBar / 2);
      if (beatInMeasure === 0 || beatInMeasure === 2) {
        playTone(105, time, 0.18, 0.2, "sine", 43);
      } else {
        playNoise(time, 0.16, 0.045, 1700);
        playTone(185, time, 0.09, 0.035, "triangle");
      }
    }

    playNoise(time, 0.035, beatInBar % 2 === 0 ? 0.009 : 0.014, 8500, "highpass");
    nextStepTime += beatLength / 2;
    step += 1;
  }

  function startScheduler() {
    nextStepTime = audioContext.currentTime + 0.05;
    scheduler = window.setInterval(() => {
      while (nextStepTime < audioContext.currentTime + 0.12) {
        scheduleStep();
      }
    }, 50);
  }

  function updateButton(isPlaying, announcement) {
    playing = isPlaying;
    musicButton.classList.toggle("is-playing", isPlaying);
    musicButton.setAttribute("aria-pressed", String(isPlaying));
    musicLabel.textContent = isPlaying ? "Pause the lo-fi" : "Play a little lo-fi";
    musicAnnouncement.textContent = announcement;
  }

  musicButton.addEventListener("click", async () => {
    try {
      if (!audioContext) {
        setupAudio();
      }

      if (playing) {
        window.clearInterval(scheduler);
        masterGain.gain.cancelScheduledValues(audioContext.currentTime);
        masterGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.08);
        updateButton(false, "Lo-fi soundtrack paused.");
        return;
      }

      await audioContext.resume();
      masterGain.gain.cancelScheduledValues(audioContext.currentTime);
      masterGain.gain.setTargetAtTime(1.5, audioContext.currentTime, 0.12);
      startScheduler();
      updateButton(true, "Lo-fi soundtrack playing.");
    } catch (error) {
      musicAnnouncement.textContent = "Could not start the soundtrack. Please try again in a browser that supports Web Audio.";
      console.error("Unable to start the lo-fi soundtrack:", error);
    }
  });
}