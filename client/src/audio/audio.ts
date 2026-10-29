// Som do Wildora: música e efeitos 8-bit sintetizados na hora (Web Audio), sem arquivos.
// O navegador só libera áudio depois de um toque/tecla; até lá tudo fica em silêncio.
import { BATTLE, CAUGHT, EVOLVE, GYM, HEAL, LEVEL_UP, NIGHT, ROUTE, VICTORY, VILLAGE, type Track } from "./tracks";

export type MusicId = "village" | "route" | "night" | "battle" | "gym";
type JingleId = "victory" | "heal" | "level" | "evolve" | "caught";

const MUSIC: Record<MusicId, Track> = { village: VILLAGE, route: ROUTE, night: NIGHT, battle: BATTLE, gym: GYM };
const JINGLES: Record<JingleId, Track> = { victory: VICTORY, heal: HEAL, level: LEVEL_UP, evolve: EVOLVE, caught: CAUGHT };

export interface AudioSettings {
  music: number;
  sfx: number;
  muted: boolean;
}

const KEY = "wildora-audio";
function loadSettings(): AudioSettings {
  const base: AudioSettings = { music: 0.5, sfx: 0.7, muted: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...base, ...JSON.parse(raw) };
  } catch {
    /* sem armazenamento: usa o padrão */
  }
  return base;
}

// ---------------- Notas ----------------

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function freq(note: string, transpose = 0): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) return 0;
  const semi = SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + (Number(m[3]) + 1) * 12 + transpose;
  return 440 * 2 ** ((semi - 69) / 12);
}

interface Hit {
  freq: number;
  len: number;
}
/** Expande uma voz em um mapa posição → nota. */
function expand(notes: [string, number][], transpose: number): { at: Map<number, Hit>; length: number } {
  const at = new Map<number, Hit>();
  let pos = 0;
  for (const [n, len] of notes) {
    if (n !== "-") at.set(pos, { freq: freq(n, transpose), len });
    pos += len;
  }
  return { at, length: pos };
}

// ---------------- Motor ----------------

class Sound {
  settings = loadSettings();
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private pulse!: PeriodicWave;

  private wanted: MusicId | null = null;
  private playing: { id: MusicId | JingleId; stop: () => void } | null = null;
  private afterJingle: MusicId | null = null;

  constructor() {
    const unlock = () => {
      this.ensure();
      if (this.ctx?.state === "suspended") void this.ctx.resume();
      if (this.wanted && !this.playing) this.startMusic(this.wanted);
    };
    for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, unlock, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  private ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    this.build(new Ctx());
    return this.ctx;
  }

  private build(ctx: BaseAudioContext) {
    this.ctx = ctx as AudioContext;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    // ruído branco para bateria e efeitos
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // onda de pulso 25% (som clássico de videogame)
    const n = 32;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    this.pulse = ctx.createPeriodicWave(real, imag);
    this.applySettings();
  }

  /**
   * Grava uma trilha sem tocar (para conferir e mostrar a música fora do jogo).
   * Devolve as amostras em mono.
   */
  async renderOffline(id: MusicId | JingleId, seconds: number, sampleRate = 44100): Promise<Float32Array> {
    const saved = { ctx: this.ctx, master: this.master, musicBus: this.musicBus, sfxBus: this.sfxBus, noise: this.noise, pulse: this.pulse };
    const off = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
    this.build(off);
    this.musicBus.gain.value = this.settings.music * 0.55;
    this.master.gain.value = 1;
    const track = (MUSIC as Record<string, Track>)[id] ?? (JINGLES as Record<string, Track>)[id];
    const tr = track.transpose ?? 0;
    const level = track.level ?? 1;
    const lead = expand(track.lead, tr);
    const bass = expand(track.bass, tr);
    const harm = track.harmony ? expand(track.harmony, tr) : null;
    const length = Math.max(lead.length, bass.length, harm?.length ?? 0, track.drums?.length ?? 0);
    const sixteenth = 60 / track.bpm / 4;
    for (let step = 0, t = 0.05; t < seconds - 0.3; step++, t += sixteenth) {
      if (!track.loop && step >= length) break;
      const pos = step % length;
      const l = lead.at.get(pos);
      if (l) this.tone(this.musicBus, t, l.freq, l.len * sixteenth * 0.92, track.leadWave ?? "pulse", 0.16 * level);
      const b = bass.at.get(pos);
      if (b) this.tone(this.musicBus, t, b.freq, b.len * sixteenth * 0.85, "triangle", 0.32 * level);
      const h = harm?.at.get(pos);
      if (h) this.tone(this.musicBus, t, h.freq, h.len * sixteenth * 0.7, "pulse", 0.045 * level);
      const d = track.drums?.[pos];
      if (d && d !== ".") this.drum(t, d, level);
    }
    const buf = await off.startRendering();
    Object.assign(this, saved);
    return buf.getChannelData(0);
  }

  /** Para depuração: o que está tocando. */
  get nowPlaying() {
    return this.playing?.id ?? null;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === "running";
  }

  // ---------- Volume ----------

  setSettings(s: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...s };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      /* ignora */
    }
    this.applySettings();
  }

  private applySettings() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const { music, sfx, muted } = this.settings;
    this.master.gain.setTargetAtTime(muted ? 0 : 1, t, 0.03);
    this.musicBus.gain.setTargetAtTime(music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(sfx * 0.8, t, 0.03);
  }

  // ---------- Instrumentos ----------

  private tone(
    bus: AudioNode,
    at: number,
    f: number,
    dur: number,
    wave: "pulse" | "square" | "triangle" | "sine" | "sawtooth",
    vol: number,
    slideTo?: number,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    if (wave === "pulse") osc.setPeriodicWave(this.pulse);
    else osc.type = wave;
    osc.frequency.setValueAtTime(f, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
    g.gain.setValueAtTime(vol * 0.75, at + Math.max(0.01, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private noiseHit(bus: AudioNode, at: number, dur: number, vol: number, filter: BiquadFilterType, hz: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }

  private drum(at: number, kind: string, level: number) {
    if (kind === "k") this.tone(this.musicBus, at, 140, 0.16, "sine", 0.55 * level, 45);
    else if (kind === "s") this.noiseHit(this.musicBus, at, 0.12, 0.22 * level, "bandpass", 1800);
    else if (kind === "h") this.noiseHit(this.musicBus, at, 0.04, 0.08 * level, "highpass", 7000);
  }

  // ---------- Sequenciador ----------

  /** Toca uma trilha; devolve a função que para. onEnd: trilhas sem repetição. */
  private sequence(track: Track, onEnd?: () => void): () => void {
    const ctx = this.ctx!;
    const tr = track.transpose ?? 0;
    const level = track.level ?? 1;
    const lead = expand(track.lead, tr);
    const bass = expand(track.bass, tr);
    const harm = track.harmony ? expand(track.harmony, tr) : null;
    const length = Math.max(lead.length, bass.length, harm?.length ?? 0, track.drums?.length ?? 0);
    const sixteenth = 60 / track.bpm / 4;
    let step = 0;
    let next = ctx.currentTime + 0.06;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      while (next < ctx.currentTime + 0.15) {
        const pos = step % length;
        if (!track.loop && step >= length) {
          stopped = true;
          window.clearInterval(timer);
          window.setTimeout(() => onEnd?.(), Math.max(0, (next - ctx.currentTime) * 1000));
          return;
        }
        const l = lead.at.get(pos);
        if (l) this.tone(this.musicBus, next, l.freq, l.len * sixteenth * 0.92, track.leadWave ?? "pulse", 0.16 * level);
        const b = bass.at.get(pos);
        if (b) this.tone(this.musicBus, next, b.freq, b.len * sixteenth * 0.85, "triangle", 0.32 * level);
        const h = harm?.at.get(pos);
        if (h) this.tone(this.musicBus, next, h.freq, h.len * sixteenth * 0.7, "pulse", 0.045 * level);
        const d = track.drums?.[pos];
        if (d && d !== ".") this.drum(next, d, level);
        next += sixteenth;
        step += 1;
      }
    };
    const timer = window.setInterval(tick, 25);
    tick();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }

  /** Para a música atual com um fade curto. */
  private fadeOut() {
    const p = this.playing;
    this.playing = null;
    if (!p || !this.ctx) return;
    const t = this.ctx.currentTime;
    const { music } = this.settings;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(0.0001, t + 0.25);
    p.stop();
    this.musicBus.gain.setValueAtTime(0.0001, t + 0.3);
    this.musicBus.gain.linearRampToValueAtTime(music * 0.55, t + 0.45);
  }

  private startMusic(id: MusicId) {
    if (!this.ready) return;
    if (this.playing?.id === id) return;
    this.fadeOut();
    const delay = this.playing ? 0 : 300;
    window.setTimeout(() => {
      if (this.wanted !== id || this.playing) return;
      this.playing = { id, stop: this.sequence(MUSIC[id]) };
    }, delay);
  }

  // ---------- API ----------

  private area = "Vila Broto";
  private night = false;
  private battling = false;

  /** Música do mundo conforme a área e a hora (vila, rotas ou noite). */
  private worldMusic(): MusicId {
    if (this.night) return "night";
    return /Vila|Distrito/.test(this.area) ? "village" : "route";
  }

  setArea(name: string) {
    this.area = name;
    if (!this.battling) this.music(this.worldMusic());
  }

  setNight(night: boolean) {
    this.night = night;
    if (!this.battling) this.music(this.worldMusic());
  }

  /** Começou uma batalha: selvagem usa a trilha de batalha; ginásio e jogadores, a de ginásio. */
  battleStart(kind: "wild" | "trainer") {
    this.battling = true;
    this.sfx("encounter");
    this.music(kind === "wild" ? "battle" : "gym");
  }

  battleEnd() {
    this.battling = false;
    this.music(this.worldMusic());
  }

  /** Música de fundo desejada (troca com fade; fica guardada até o áudio ser liberado). */
  music(id: MusicId) {
    this.wanted = id;
    if (this.afterJingle) {
      this.afterJingle = id;
      return;
    }
    if (this.ready) this.startMusic(id);
  }

  /** Vinheta curta; depois volta para a música desejada. */
  jingle(id: JingleId) {
    if (!this.ready) return;
    this.fadeOut();
    this.afterJingle = this.wanted ?? "village";
    window.setTimeout(() => {
      const stop = this.sequence(JINGLES[id], () => {
        if (this.playing?.id !== id) return;
        this.playing = null;
        const back = this.afterJingle;
        this.afterJingle = null;
        if (back) this.startMusic(back);
      });
      this.playing = { id, stop };
    }, 280);
  }

  /** Efeitos sonoros. */
  sfx(name: SfxName) {
    if (!this.ready) return;
    const t = this.ctx!.currentTime + 0.005;
    const bus = this.sfxBus;
    switch (name) {
      case "click":
        this.tone(bus, t, 1046, 0.035, "pulse", 0.12);
        break;
      case "back":
        this.tone(bus, t, 660, 0.04, "pulse", 0.1, 440);
        break;
      case "grass":
        this.noiseHit(bus, t, 0.07, 0.09, "bandpass", 2600);
        break;
      case "bump":
        this.tone(bus, t, 110, 0.06, "square", 0.12, 80);
        break;
      case "door":
        this.tone(bus, t, 392, 0.07, "pulse", 0.15);
        this.tone(bus, t + 0.07, 587, 0.1, "pulse", 0.15);
        break;
      case "encounter":
        for (let i = 0; i < 6; i++) this.tone(bus, t + i * 0.045, 1318 - i * 140, 0.05, "square", 0.12);
        break;
      case "hit":
        this.noiseHit(bus, t, 0.09, 0.4, "lowpass", 3000);
        this.tone(bus, t, 320, 0.08, "square", 0.14, 90);
        break;
      case "super":
        this.noiseHit(bus, t, 0.14, 0.5, "lowpass", 5000);
        this.tone(bus, t, 520, 0.12, "square", 0.18, 70);
        this.tone(bus, t + 0.05, 1040, 0.08, "pulse", 0.1, 300);
        break;
      case "weak":
        this.noiseHit(bus, t, 0.07, 0.22, "lowpass", 1200);
        this.tone(bus, t, 200, 0.07, "triangle", 0.12, 120);
        break;
      case "miss":
        this.noiseHit(bus, t, 0.22, 0.12, "bandpass", 900);
        break;
      case "status":
        for (let i = 0; i < 3; i++) this.tone(bus, t + i * 0.06, 700 + i * 120, 0.05, "pulse", 0.1);
        break;
      case "faint":
        this.tone(bus, t, 620, 0.55, "square", 0.14, 70);
        break;
      case "throw":
        this.tone(bus, t, 300, 0.25, "triangle", 0.2, 1100);
        break;
      case "shake":
        this.tone(bus, t, 220, 0.05, "square", 0.12);
        this.tone(bus, t + 0.09, 196, 0.05, "square", 0.12);
        break;
      case "escape":
        this.tone(bus, t, 880, 0.18, "pulse", 0.12, 330);
        break;
      case "run":
        this.noiseHit(bus, t, 0.3, 0.12, "highpass", 1500);
        break;
      case "buy":
        this.tone(bus, t, 988, 0.07, "pulse", 0.14);
        this.tone(bus, t + 0.07, 1318, 0.18, "pulse", 0.14);
        break;
      case "ping":
        this.tone(bus, t, 784, 0.1, "sine", 0.22);
        this.tone(bus, t + 0.12, 1046, 0.16, "sine", 0.22);
        break;
      case "switch":
        this.tone(bus, t, 440, 0.06, "pulse", 0.1, 880);
        break;
    }
  }
}

export type SfxName =
  | "click"
  | "back"
  | "grass"
  | "bump"
  | "door"
  | "encounter"
  | "hit"
  | "super"
  | "weak"
  | "miss"
  | "status"
  | "faint"
  | "throw"
  | "shake"
  | "escape"
  | "run"
  | "buy"
  | "ping"
  | "switch";

export const sound = new Sound();
