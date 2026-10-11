// Tiny WebAudio chiptune engine: pulse-wave lead/arp, bass, noise drums + SFX.
const Sound = (() => {
  let ctx = null, master, musicBus, sfxBus, noiseBuf, waves = {};
  let musicOn = true;
  try { musicOn = localStorage.getItem('battledongs.music') !== '0'; } catch (e) {}
  let song = null, songName = null, step = 0, nextTime = 0, timer = null;

  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const toMidi = s => { const m = s.match(/^([A-G]#?)(\d)$/); return 12 * (+m[2] + 1) + NOTE[m[1]]; };

  function parseMelody(bars) {
    const toks = bars.join(' ').trim().split(/\s+/);
    const out = new Array(toks.length).fill(null);
    for (let i = 0; i < toks.length; i++) {
      if (toks[i] === '-' || toks[i] === '.') continue;
      let len = 1;
      while (toks[i + len] === '-') len++;
      out[i] = { m: toMidi(toks[i]), len };
    }
    return out;
  }

  const SONGS = {
    // quirky oom-pah junkyard waltz-ish tune
    menu: {
      bpm: 112, swing: 0.18, root: [48, 48, 41, 43], kind: ['M', 'M', 'M', 'dom'],
      kick: [0, 8], snare: [4, 12], hat: 2, bass: 'oompah', arp: 'stab',
      melody: parseMelody([
        'C5 . E5 . G5 . A5 G5 . E5 . C5 . D5 E5 .',
        'D#5 E5 . C5 . G4 . . C5 . . . . . . .',
        'F5 . A5 . C6 . D6 C6 . A5 . F5 . G5 A5 .',
        'G5 . F5 . D5 . B4 . G4 . A4 . B4 . D5 .',
        'C5 . E5 . G5 . C6 - - . B5 . A5 . G5 .',
        'G#5 A5 . G5 . E5 . . C5 - - - . . . .',
        'F5 . E5 . F5 . A5 . C6 . A5 . F5 . D5 .',
        'G5 - - . F5 . D5 . C5 - - - . . . .',
      ]),
    },
    // greasy swung blues-funk groove for the fights
    battle: {
      bpm: 132, swing: 0.22, root: [40, 40, 45, 47], kind: ['dom', 'dom', 'dom', 'dom'],
      kick: [0, 7, 10], snare: [4, 12], hat: 2, bass: 'funk', arp: 'run',
      melody: parseMelody([
        'E5 . G5 . E5 G5 A5 . A#5 B5 . . A5 . G5 .',
        'E5 - - . D5 . E5 . . . G5 . E5 . D5 .',
        'A5 . C6 . A5 C6 D6 . D#6 E6 . . D6 . C6 .',
        'B5 - - - A5 . F#5 . B4 . D#5 . F#5 . A5 .',
        'E5 . E5 . G5 . E5 . B5 - - . A5 . G5 .',
        'E5 . D5 . B4 . D5 . E5 - - - . . . .',
        'A5 . A5 . C6 . A5 . E6 - - . D6 . C6 .',
        'B5 . A5 . F#5 . D#5 . E5 - - - . . . .',
      ]),
    },
    // Ballsack Canyon: spaghetti-western gallop, whistled lead
    desert: {
      bpm: 150, swing: 0, root: [45, 45, 43, 40], kind: ['m', 'm', 'M', 'dom'],
      kick: [0, 8], snare: [12], hat: 4, bass: 'gallop', arp: 'stab', lead: 'whistle',
      melody: parseMelody([
        'A4 . . E5 - - - . A5 - - . G5 . E5 .',
        'D5 - - - - - . . E5 . D5 . C5 . B4 .',
        'C5 - - B4 . A4 . . G4 - - - B4 . D5 .',
        'E5 - - - - - - . . . . . G#4 . B4 .',
        'A4 . . E5 - - - . A5 - - . B5 . C6 .',
        'B5 - - A5 . G5 . . A5 - - . E5 . . .',
        'F5 - - E5 . D5 . . C5 . B4 . A4 . G#4 .',
        'A4 - - - - - - - . . . . . . . .',
      ]),
    },
    // Sewer Sludge: creepy minor stomp
    toxic: {
      bpm: 138, swing: 0.1, root: [40, 40, 36, 38], kind: ['m', 'm', 'M', 'M'],
      kick: [0, 3, 6, 10], snare: [4, 12], hat: 2, bass: 'octave', arp: 'run', lead: 'p12',
      melody: parseMelody([
        'E5 . . G5 . . F#5 . E5 . . . B4 . . .',
        'E5 . G5 . A5 . A#5 . B5 - - . A5 . G5 .',
        'E5 . . G5 . . F#5 . E5 . . . C5 . . .',
        'D5 . E5 . F#5 . G5 . F#5 - - - D5 . . .',
        'B5 . . B5 . A5 G5 . A5 . . . E5 . . .',
        'G5 . F#5 . E5 . D5 . E5 - - . B4 . . .',
        'C5 . E5 . G5 . C6 . B5 - - . G5 . . .',
        'A5 . G5 . F#5 . D5 . E5 - - - - - . .',
      ]),
    },
    // Shrinkage Peaks: sparkly music-box waltz on ice
    frozen: {
      bpm: 104, swing: 0, root: [50, 47, 43, 45], kind: ['M', 'm', 'M', 'M'],
      kick: [0], snare: [8], hat: 4, bass: 'oompah', arp: 'chime', lead: 'p12',
      melody: parseMelody([
        'F#5 . A5 . D6 . . . C#6 . A5 . . . E5 .',
        'F#5 - - - D5 . . . B4 . D5 . F#5 . B5 .',
        'G5 . B5 . D6 . . . B5 . G5 . . . D5 .',
        'E5 - - - - - . . C#5 . E5 . A5 . . .',
        'F#5 . A5 . D6 . E6 . F#6 - - . E6 . D6 .',
        'D6 . C#6 . B5 . . . F#5 - - . B5 . . .',
        'B5 . A5 . G5 . . . D5 . E5 . G5 . B5 .',
        'A5 - - . G5 . E5 . D5 - - - - - . .',
      ]),
    },
    // The Strip District: sleazy four-on-the-floor disco
    neon: {
      bpm: 122, swing: 0, root: [45, 50, 43, 48], kind: ['m', 'm', 'M', 'M'],
      kick: [0, 4, 8, 12], snare: [4, 12], hat: 2, openHat: true, bass: 'octave', arp: 'run', lead: 'p25',
      melody: parseMelody([
        'A5 . . A5 . C6 . A5 . . G5 . . E5 . .',
        'A5 . . A5 . C6 . D6 . C6 . A5 . . . .',
        'D6 . . D6 . C6 . A5 . . F5 . . A5 . .',
        'G5 - - - - - . . E5 . G5 . A5 . . .',
        'B5 . . B5 . D6 . B5 . . G5 . . D5 . .',
        'G5 . A5 . B5 . D6 . E6 - - . D6 . . .',
        'C6 . . C6 . E6 . C6 . . G5 . . E5 . .',
        'G5 - - . E5 . C5 . A4 - - - . . . .',
      ]),
    },
    // Ballsy March: a brass-band military march for the battlefield
    march: {
      bpm: 116, swing: 0, root: [48, 53, 43, 48], kind: ['M', 'M', 'dom', 'M'],
      kick: [0, 8], snare: [4, 10, 12, 14], hat: 4, bass: 'oompah', arp: 'stab', lead: 'p50',
      melody: parseMelody([
        'C5 . . C5 E5 . G5 . C6 - - . G5 . E5 .',
        'F5 . . F5 A5 . C6 . A5 - - . F5 . . .',
        'G5 . . G5 B5 . D6 . F6 - - . D6 . B5 .',
        'C6 - - . G5 . E5 . C5 - - - . . . .',
        'E5 . E5 . E5 . F5 . G5 - - . E5 . C5 .',
        'A5 . A5 . A5 . G5 . F5 - - - . . . .',
        'D5 . E5 . F5 . G5 . A5 . B5 . D6 . F6 .',
        'E6 - - . D6 . B5 . C6 - - - - - . .',
      ]),
    },
    // Elevator Bossa: smooth lounge music while dongs blow each other up
    lounge: {
      bpm: 104, swing: 0.2, root: [53, 50, 55, 48], kind: ['M', 'm', 'm', 'dom'],
      kick: [0, 6, 8], snare: [3, 10, 13], hat: 2, bass: 'bossa', arp: 'chime', lead: 'whistle',
      melody: parseMelody([
        'A5 - - G5 . A5 . . C6 - - - A5 . . .',
        'F5 - - E5 . F5 . . A5 - - - - - . .',
        'D5 . F5 . A#5 - - . A5 . G5 . F5 . D5 .',
        'E5 - - - - - . . G5 . E5 . C5 . . .',
        'A5 - - G5 . A5 . . D6 - - - C6 . . .',
        'A5 - - G5 . F5 . . D5 - - - - - . .',
        'G5 . A5 . A#5 . D6 . C6 - - . A#5 . G5 .',
        'F5 - - - - - - - . . . . . . . .',
      ]),
    },
    // Shred Shaft: fast chiptune metal, double kick and chugging bass
    metal: {
      bpm: 168, swing: 0, root: [40, 40, 36, 38], kind: ['m', 'm', 'M', 'M'],
      kick: [0, 2, 4, 6, 8, 10, 12, 14], snare: [4, 12], hat: 2, bass: 'chug', arp: 'run', lead: 'p25',
      melody: parseMelody([
        'E5 . G5 . A5 . B5 . E6 - - . D6 . B5 .',
        'A5 . G5 . E5 . D5 . E5 - - - . . . .',
        'E5 . G5 . A5 . B5 . C6 . B5 . A5 . G5 .',
        'F#5 . G5 . A5 . F#5 . D5 - - - . . . .',
        'B5 B5 . B5 B5 . A5 . G5 . A5 . B5 - - .',
        'E6 . D6 . B5 . A5 . G5 . A5 . B5 . . .',
        'C6 . B5 . A5 . G5 . A5 . G5 . F#5 . E5 .',
        'D5 . F#5 . A5 . F#5 . E5 - - - - - - .',
      ]),
    },
    // Sleazy Sax: slow late-night menu groove
    sleaze: {
      bpm: 92, swing: 0.3, root: [45, 45, 50, 52], kind: ['m', 'm', 'm', 'dom'],
      kick: [0, 10], snare: [4, 12], hat: 2, bass: 'funk', arp: 'stab', lead: 'sax',
      melody: parseMelody([
        'A4 - - C5 . D5 . D#5 E5 - - - . . G5 .',
        'E5 - - D5 . C5 . . A4 - - - - - . .',
        'A4 - - C5 . D5 . D#5 E5 - - . G5 . A5 .',
        'G5 - - E5 . D5 . . E5 - - - - - . .',
        'D5 - - F5 . A5 . . C6 - - . A5 . F5 .',
        'E5 - - - - - . . G#4 . B4 . E5 . . .',
        'A4 - - C5 . E5 . . A5 - - . G5 . E5 .',
        'D#5 E5 . C5 . A4 - - - - - - . . . .',
      ]),
    },
  };
  for (const [k, S] of Object.entries(SONGS)) if (S.melody.length !== 128) console.warn('song', k, 'has', S.melody.length, 'steps');
  const CHORD = { M: [0, 4, 7, 12], m: [0, 3, 7, 12], dom: [0, 4, 7, 10] };
  const FUNK = { 0: 0, 3: 12, 6: 0, 7: 10, 10: 0, 12: 12, 14: 7, 15: 10 };

  function pulse(duty) {
    const n = 48, real = new Float32Array(n), imag = new Float32Array(n);
    for (let i = 1; i < n; i++) real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.32 : 0; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.7; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    waves = { p12: pulse(0.125), p25: pulse(0.25), p50: pulse(0.5) };
    if (songName) play(songName, true);
  }

  // ---- voices
  function tone(t, freq, dur, o = {}) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    if (waves[o.wave]) osc.setPeriodicWave(waves[o.wave]); else osc.type = o.wave || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + (o.slideT || dur));
    if (o.vib) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * 0.02, t + dur);
      lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    const v = o.gain ?? 0.2, a = o.attack ?? 0.005, r = o.release ?? 0.05;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v * (o.sustain ?? 0.8), t + Math.max(a, dur - r));
    g.gain.linearRampToValueAtTime(0, t + dur);
    let node = g;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; g.connect(f); node = f; }
    osc.connect(g); node.connect(o.dest || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  function noise(t, dur, o = {}) {
    const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    src.buffer = noiseBuf;
    f.type = o.type || 'highpass'; f.frequency.setValueAtTime(o.freq || 6000, t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
    f.Q.value = o.q || 1;
    g.gain.setValueAtTime(o.gain ?? 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  function kick(t) { tone(t, 150, 0.16, { wave: 'sine', slide: 40, slideT: 0.12, gain: 0.9, dest: musicBus, release: 0.1 }); }
  function snare(t) {
    noise(t, 0.14, { type: 'bandpass', freq: 2200, gain: 0.45, dest: musicBus });
    tone(t, 220, 0.07, { wave: 'p50', slide: 120, gain: 0.18, dest: musicBus });
  }
  function hat(t, acc) { noise(t, acc ? 0.06 : 0.03, { freq: 8000, gain: acc ? 0.16 : 0.08, dest: musicBus }); }

  // ---- sequencer
  function playStep(s, t) {
    const S = song, sixteenth = 60 / S.bpm / 4;
    const pos = s % 16, bar = Math.floor(s / 16) % 4;
    const root = S.root[bar], ch = CHORD[S.kind[bar]];
    const mel = S.melody[s % S.melody.length];
    if (mel) {
      if (S.lead === 'sax') tone(t, hz(mel.m - 12), mel.len * sixteenth * 0.95, { wave: 'sawtooth', gain: 0.16, lp: 1500, dest: musicBus, vib: mel.len >= 2, attack: 0.02, release: 0.08 });
      else if (S.lead === 'whistle') tone(t, hz(mel.m), mel.len * sixteenth * 0.95, { wave: 'sine', gain: 0.2, dest: musicBus, vib: true, attack: 0.03, release: 0.06 });
      else tone(t, hz(mel.m), mel.len * sixteenth * 0.95, { wave: S.lead || 'p25', gain: 0.17, dest: musicBus, vib: mel.len >= 3, release: 0.04 });
    }
    if (mel && mel.len <= 2) tone(t + sixteenth * 1.5, hz(mel.m), mel.len * sixteenth * 0.8, { wave: 'p12', gain: 0.05, dest: musicBus });
    if (S.arp === 'chime') {
      if (pos % 4 === 0) tone(t, hz(root + 24 + ch[(pos / 4) % 4]), sixteenth * 3, { wave: 'p12', gain: 0.05, dest: musicBus, release: 0.2, sustain: 0.4 });
    } else if (S.arp === 'stab') {
      if (pos % 4 === 2) for (const n of ch.slice(0, 3)) tone(t, hz(root + 12 + n), sixteenth * 0.8, { wave: 'p25', gain: 0.045, dest: musicBus, release: 0.02 });
    } else tone(t, hz(root + 12 + ch[pos % 4]), sixteenth * 0.9, { wave: 'p12', gain: 0.05, dest: musicBus, release: 0.02 });
    if (S.bass === 'oompah') {
      if (pos % 8 === 0) tone(t, hz(root - 12), sixteenth * 1.6, { wave: 'p50', gain: 0.24, lp: 800, dest: musicBus });
      if (pos % 8 === 4) tone(t, hz(root - 5), sixteenth * 1.6, { wave: 'p50', gain: 0.2, lp: 800, dest: musicBus });
    } else if (S.bass === 'bossa') {
      if ([0, 3, 6, 8, 11, 14].includes(pos)) tone(t, hz(root - 12 + (pos === 6 || pos === 14 ? 7 : 0)), sixteenth * 1.6, { wave: 'sine', gain: 0.32, dest: musicBus });
    } else if (S.bass === 'chug') {
      tone(t, hz(root - 12 + (pos === 14 ? 3 : pos === 15 ? 5 : 0)), sixteenth * 0.5, { wave: 'sawtooth', gain: 0.17, lp: 650, dest: musicBus });
    } else if (S.bass === 'gallop') {
      if (pos % 4 !== 1) tone(t, hz(root - 12 + (pos % 8 >= 4 ? 7 : 0)), sixteenth * 0.7, { wave: 'p50', gain: 0.22, lp: 900, dest: musicBus });
    } else if (S.bass === 'octave') {
      if (pos % 2 === 0) tone(t, hz(root - 12 + (pos % 4 ? 12 : 0)), sixteenth * 0.9, { wave: 'sawtooth', gain: 0.2, lp: 900, dest: musicBus });
    } else if (FUNK[pos] !== undefined) {
      // slap bass: octave pops get a brighter, shorter pluck
      const pop = FUNK[pos] >= 10;
      tone(t, hz(root - 12 + FUNK[pos]), sixteenth * (pop ? 0.6 : 1.4), { wave: 'sawtooth', gain: pop ? 0.2 : 0.24, lp: pop ? 1800 : 650, dest: musicBus, slide: pop ? undefined : hz(root - 12 + FUNK[pos]) * 0.97 });
    }
    if (S.kick.includes(pos)) kick(t);
    if (S.snare.includes(pos)) snare(t);
    if (pos % S.hat === 0) hat(t, S.openHat ? pos % 4 === 2 : pos === 14);
  }

  function schedule() {
    if (!ctx || !song) return;
    while (nextTime < ctx.currentTime + 0.15) {
      if (musicOn) playStep(step, nextTime + (step % 2 ? (song.swing || 0) * 60 / song.bpm / 4 : 0));
      nextTime += 60 / song.bpm / 4;
      step++;
    }
  }

  function play(name, force) {
    if (songName === name && !force && timer) return;
    songName = name; song = SONGS[name];
    if (!ctx) return;
    step = 0; nextTime = ctx.currentTime + 0.1;
    clearInterval(timer); timer = setInterval(schedule, 25);
  }

  function stop() { clearInterval(timer); timer = null; songName = null; }

  function setMusic(on) {
    musicOn = on;
    try { localStorage.setItem('battledongs.music', on ? '1' : '0'); } catch (e) {}
    if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.32 : 0, ctx.currentTime, 0.05);
  }

  // ---- sound effects
  const now = () => ctx.currentTime;
  const fx = {
    click() { tone(now(), 990, 0.05, { wave: 'p25', gain: 0.12 }); },
    hover() { tone(now(), 660, 0.025, { wave: 'p12', gain: 0.05 }); },
    select() { tone(now(), 660, 0.05, { wave: 'p25', gain: 0.15 }); tone(now() + 0.05, 990, 0.07, { wave: 'p25', gain: 0.15 }); },
    move() { tone(now(), 300, 0.1, { wave: 'p25', slide: 700, gain: 0.12 }); },
    bonk() { tone(now(), 500, 0.18, { wave: 'p50', slide: 90, gain: 0.25 }); noise(now(), 0.08, { type: 'lowpass', freq: 1200, gain: 0.3 }); },
    shoot() {
      tone(now(), 160, 0.25, { wave: 'sawtooth', slide: 900, gain: 0.16, lp: 2500 });
      noise(now() + 0.04, 0.25, { type: 'bandpass', freq: 600, sweep: 3000, q: 4, gain: 0.35 });
    },
    splat() {
      noise(now(), 0.35, { type: 'lowpass', freq: 2500, sweep: 200, gain: 0.5 });
      tone(now(), 220, 0.25, { wave: 'sine', slide: 50, gain: 0.4 });
    },
    hit() {
      tone(now(), 880, 0.3, { wave: 'p25', slide: 110, gain: 0.25, vib: true });
      noise(now(), 0.12, { type: 'bandpass', freq: 1500, gain: 0.3 });
    },
    pickup() { [72, 76, 79, 84].forEach((m, i) => tone(now() + i * 0.05, hz(m + 12), 0.08, { wave: 'p25', gain: 0.15 })); },
    death() { tone(now(), 600, 0.9, { wave: 'sawtooth', slide: 40, gain: 0.22, vib: true, lp: 1800 }); },
    tick() { tone(now(), 1500, 0.03, { wave: 'p50', gain: 0.08 }); },
    rev(k = 0) { tone(now(), 180 + k * 9, 0.06, { wave: 'p25', slide: 220 + k * 10, gain: 0.07 + k * 0.0008 }); },
    turn() { tone(now(), hz(81), 0.06, { wave: 'p25', gain: 0.1 }); tone(now() + 0.07, hz(88), 0.08, { wave: 'p25', gain: 0.1 }); },
    crumble() { noise(now(), 0.9, { type: 'lowpass', freq: 600, sweep: 60, gain: 0.6 }); tone(now(), 80, 0.8, { wave: 'sawtooth', slide: 30, gain: 0.2, lp: 300 }); },
    clang() { [1800, 2400, 3100].forEach(f => tone(now(), f, 0.35, { wave: 'p12', slide: f * 0.97, gain: 0.08 })); noise(now(), 0.1, { freq: 5000, gain: 0.2 }); },
    freeze() { [96, 91, 88, 84].forEach((m, i) => tone(now() + i * 0.04, hz(m), 0.12, { wave: 'p12', gain: 0.1 })); noise(now(), 0.4, { freq: 7000, gain: 0.12 }); },
    power() { [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => tone(now() + i * 0.035, hz(m + 12), 0.07, { wave: 'p25', gain: 0.13 })); },
    ook() { [0, 0.16].forEach(d => tone(now() + d, 420, 0.13, { wave: 'p50', slide: 260, gain: 0.2, lp: 1500 })); },
    fart() { tone(now(), 90, 0.45, { wave: 'sawtooth', slide: 55, gain: 0.35, lp: 400, vib: true }); noise(now(), 0.4, { type: 'lowpass', freq: 300, gain: 0.4 }); },
    boom(r = 16) {
      const big = Math.min(1, r / 45);
      noise(now(), 0.4 + big * 0.9, { type: 'lowpass', freq: 1800 - big * 900, sweep: 60, gain: 0.5 + big * 0.4 });
      tone(now(), 140 - big * 60, 0.3 + big * 0.6, { wave: 'sine', slide: 30, gain: 0.5 + big * 0.3 });
    },
    pop() { tone(now(), 700, 0.08, { wave: 'p25', slide: 1400, gain: 0.15 }); noise(now(), 0.06, { freq: 3000, gain: 0.15 }); },
    dirt() { noise(now(), 0.5, { type: 'lowpass', freq: 500, sweep: 120, gain: 0.5 }); tone(now(), 90, 0.3, { wave: 'p50', slide: 50, gain: 0.15, lp: 400 }); },
    sizzle() { noise(now(), 1.2, { type: 'bandpass', freq: 4000, sweep: 1500, q: 2, gain: 0.3 }); },
    boing() { tone(now(), 180, 0.25, { wave: 'p50', slide: 520, gain: 0.18, vib: true }); },
    zap() { [84, 91, 96, 103].forEach((m, i) => tone(now() + i * 0.04, hz(m), 0.09, { wave: 'p12', gain: 0.12 })); tone(now(), 1500, 0.4, { wave: 'p25', slide: 200, gain: 0.08 }); },
    drive() { tone(now(), 70, 0.5, { wave: 'sawtooth', slide: 95, gain: 0.18, lp: 500, vib: true }); },
    whistle() { tone(now(), 1800, 0.7, { wave: 'sine', slide: 500, gain: 0.07 }); },
    win() { [72, 76, 79, 84, 79, 84, 88].forEach((m, i) => tone(now() + i * 0.11, hz(m), i === 6 ? 0.6 : 0.1, { wave: 'p25', gain: 0.18, vib: i === 6 })); },
    lose() { [67, 63, 60, 55].forEach((m, i) => tone(now() + i * 0.18, hz(m), 0.18, { wave: 'p50', gain: 0.15, lp: 2000 })); },
  };

  return {
    init, play, stop, setMusic,
    get musicOn() { return musicOn; },
    sfx(name, a) { if (ctx && fx[name]) fx[name](a); },
  };
})();
