// ============================================================================
// AUDIO SYSTEM - PIGEON POOP ATTACK (100% Web Audio API procedurální zvuky)
// ============================================================================

class PigeonAudio {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('pigeon_muted') === 'true';
    this.initialized = false;
  }

  init() {
    if (this.initialized && this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio API není podporováno:', e);
    }
  }

  ensureContext() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('pigeon_muted', this.muted);
    return this.muted;
  }

  // Mávnutí křídel holuba
  playFlap() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.11);
  }

  // Zvuk padajícího bobku (kreslené hvízdnutí dolů)
  playDrop() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.28);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.29);
  }

  // Zásah těla - mokré plácnutí (splat)
  playSplat() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.12);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.15);

    this.playNoise(0.12, 0.2, 500, 100);
  }

  // 🔥 LEGENDÁRNÍ HEADSHOT ZVUK! 🔥
  playHeadshot() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 1. Masivní basový dopad / boom
    const boom = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(180, t);
    boom.frequency.exponentialRampToValueAtTime(30, t + 0.35);
    boomGain.gain.setValueAtTime(0.55, t);
    boomGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    boom.connect(boomGain);
    boomGain.connect(this.ctx.destination);
    boom.start(t);
    boom.stop(t + 0.36);

    // 2. Křišťálový zvonivý DING
    const bell = this.ctx.createOscillator();
    const bellGain = this.ctx.createGain();
    bell.type = 'triangle';
    bell.frequency.setValueAtTime(1250, t);
    bell.frequency.setValueAtTime(1580, t + 0.06);
    bellGain.gain.setValueAtTime(0.4, t);
    bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    bell.connect(bellGain);
    bellGain.connect(this.ctx.destination);
    bell.start(t);
    bell.stop(t + 0.46);

    this.playNoise(0.2, 0.35, 1200, 150);
  }

  // 🚴 Zásah cyklisty #1: Spadnutí helmy
  playHelmetPop() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(950, t);
    osc.frequency.exponentialRampToValueAtTime(1800, t + 0.08);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.19);
  }

  // 🚴💥 Zásah cyklisty #2: Masivní karambol kola
  playBikeCrash() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.36);

    this.playNoise(0.35, 0.4, 1500, 80);
  }

  // 💀 Sražení k zemi / K.O. zásah #2
  playKnockout() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const punch = this.ctx.createOscillator();
    const pGain = this.ctx.createGain();
    punch.type = 'sine';
    punch.frequency.setValueAtTime(220, t);
    punch.frequency.exponentialRampToValueAtTime(45, t + 0.25);
    pGain.gain.setValueAtTime(0.45, t);
    pGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    punch.connect(pGain);
    pGain.connect(this.ctx.destination);
    punch.start(t);
    punch.stop(t + 0.26);

    const gong = this.ctx.createOscillator();
    const gGain = this.ctx.createGain();
    gong.type = 'triangle';
    gong.frequency.setValueAtTime(880, t);
    gong.frequency.setValueAtTime(1100, t + 0.05);
    gGain.gain.setValueAtTime(0.3, t);
    gGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    gong.connect(gGain);
    gGain.connect(this.ctx.destination);
    gong.start(t);
    gong.stop(t + 0.41);
  }

  // Zvuk sebrání mincí
  playCoin() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, t);
    osc.frequency.setValueAtTime(1318.51, t + 0.08);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.23);
  }

  // ✨ AKTIVACE SILNÝCH SPECIÁLNÍCH SCHOPNOSTÍ [E]
  playAbility(type = 'default') {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    if (type === 'laser' || type === 'emp') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1400, t);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.45);
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.46);
    } else if (type === 'lightning') {
      this.playNoise(0.5, 0.45, 3000, 80);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.linearRampToValueAtTime(50, t + 0.45);
      gain.gain.setValueAtTime(0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.46);
    } else if (type === 'dragon') {
      // Dračí plamen
      this.playNoise(0.6, 0.5, 1800, 250);
    } else if (type === 'ufo') {
      // UFO tractor hum
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.linearRampToValueAtTime(780, t + 0.5);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.61);
    } else {
      const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const nt = t + idx * 0.05;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, nt);
        gain.gain.setValueAtTime(0.22, nt);
        gain.gain.exponentialRampToValueAtTime(0.001, nt + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(nt);
        osc.stop(nt + 0.36);
      });
    }
  }

  // Vítězství v levelu
  playLevelWin() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const chords = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
    chords.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const nt = t + i * 0.08;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, nt);
      gain.gain.setValueAtTime(0.28, nt);
      gain.gain.exponentialRampToValueAtTime(0.001, nt + 0.55);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(nt);
      osc.stop(nt + 0.56);
    });
  }

  // Prohra v levelu
  playLevelFail() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [311.13, 293.66, 277.18, 261.63, 246.94];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const nt = t + i * 0.14;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, nt);
      gain.gain.setValueAtTime(0.25, nt);
      gain.gain.exponentialRampToValueAtTime(0.001, nt + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(nt);
      osc.stop(nt + 0.36);
    });
  }

  // Zvuk nákupu v obchodě
  playPurchase() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50];
    const t = this.ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const noteT = t + i * 0.07;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteT);
      gain.gain.setValueAtTime(0.25, noteT);
      gain.gain.exponentialRampToValueAtTime(0.001, noteT + 0.2);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(noteT);
      osc.stop(noteT + 0.21);
    });
  }

  // Kreslený výkřik chodce
  playPanic() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(450 + Math.random() * 200, t);
    osc.frequency.linearRampToValueAtTime(250, t + 0.15);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  // Zvuk vylepšení holuba (upgrade level up arpeggio)
  playUpgrade() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880, 1108.73, 1318.51];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const nt = t + idx * 0.045;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, nt);
      gain.gain.setValueAtTime(0.2, nt);
      gain.gain.exponentialRampToValueAtTime(0.001, nt + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(nt);
      osc.stop(nt + 0.26);
    });
  }

  playNoise(duration = 0.1, volume = 0.2, startFreq = 800, endFreq = 200) {
    if (this.muted || !this.ctx) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(startFreq, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start();
  }
}

window.pigeonAudio = new PigeonAudio();
