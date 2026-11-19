// ─────────────────────────────────────────────────────────────
//  effects.js — 파티클·번개·충격파 등 시각 효과와 합성 사운드
//  효과음은 WebAudio로 실시간 생성한다.
// ─────────────────────────────────────────────────────────────
class Effects {
  constructor() { this.parts = []; this.texts = []; this.beams = []; this.rings = []; this.shake = 0; }

  burst(x, y, color, n = 10, speed = 120) {
    if (this.parts.length > 700) return; // 상한으로 프레임 보호
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      const life = 0.25 + Math.random() * 0.4;
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: 1.5 + Math.random() * 2 });
    }
  }
  text(x, y, str, color) { this.texts.push({ x, y, str, color, life: 0.9, max: 0.9 }); }
  beam(pts, color, width = 2, life = 0.15) { this.beams.push({ pts, color, width, life, max: life }); }
  ring(x, y, r, color, life = 0.35, sprite = null) { this.rings.push({ x, y, r, color, life, max: life, sprite }); }

  // 두 점 사이를 지그재그로 잇는 번개
  bolt(x1, y1, x2, y2, color) {
    const pts = [[x1, y1]], n = 5, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < n; i++) {
      const k = i / n, off = (Math.random() - 0.5) * 16;
      pts.push([x1 + dx * k - dy / len * off, y1 + dy * k + dx / len * off]);
    }
    pts.push([x2, y2]);
    this.beam(pts, color, 2.2, 0.14);
  }

  update(dt) {
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.life -= dt; }
    for (const t of this.texts) { t.y -= 26 * dt; t.life -= dt; }
    for (const b of this.beams) b.life -= dt;
    for (const r of this.rings) r.life -= dt;
    this.parts = this.parts.filter(p => p.life > 0);
    this.texts = this.texts.filter(t => t.life > 0);
    this.beams = this.beams.filter(b => b.life > 0);
    this.rings = this.rings.filter(r => r.life > 0);
    this.shake *= 0.88;
    if (this.shake < 0.1) this.shake = 0;
  }
}

// ── 사운드: 오실레이터와 노이즈만으로 만든 효과음 ─────────────
const Sfx = {
  ac: null, muted: false, last: {},

  init() { // 브라우저 정책상 첫 사용자 입력 이후에만 생성 가능
    if (this.ac) return;
    try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 소리 없이 진행 */ }
  },

  tone(freq, dur, type = 'square', vol = 0.05, slide = 0, delay = 0) {
    const ac = this.ac, t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur);
  },

  noise(dur, vol = 0.08) {
    const ac = this.ac, buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    src.buffer = buf; g.gain.value = vol;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
  },

  play(name) {
    if (!this.ac || this.muted) return;
    const now = performance.now();
    if (now - (this.last[name] || 0) < 55) return; // 같은 소리의 과도한 중첩 방지
    this.last[name] = now;
    switch (name) {
      case 'pulse':   this.tone(760, 0.06, 'square', 0.018, -400); break;
      case 'mortar':  this.tone(170, 0.16, 'sawtooth', 0.04, -90); break;
      case 'tesla':   this.tone(1300, 0.09, 'sawtooth', 0.025, -900); break;
      case 'rail':    this.tone(1900, 0.3, 'sawtooth', 0.05, -1800); this.noise(0.12, 0.04); break;
      case 'boom':    this.noise(0.25, 0.09); break;
      case 'kill':    this.tone(320, 0.07, 'triangle', 0.035, 260); break;
      case 'build':   this.tone(420, 0.08, 'triangle', 0.06, 200); break;
      case 'upgrade': this.tone(520, 0.09, 'triangle', 0.06); this.tone(780, 0.14, 'triangle', 0.06, 0, 0.09); break;
      case 'sell':    this.tone(620, 0.1, 'triangle', 0.05, -300); break;
      case 'freeze':  this.tone(1800, 0.35, 'sine', 0.05, -1200); this.tone(2400, 0.25, 'triangle', 0.03, -1600, 0.05); break;
      case 'leak':    this.tone(140, 0.3, 'sawtooth', 0.08, -80); break;
      case 'wave':    this.tone(330, 0.12, 'square', 0.04); this.tone(495, 0.2, 'square', 0.04, 0, 0.12); break;
      case 'boss':    this.tone(110, 0.5, 'sawtooth', 0.08, -50); this.tone(82, 0.7, 'sawtooth', 0.08, -30, 0.25); break;
      case 'win':     [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.07, 0, i * 0.13)); break;
      case 'lose':    [392, 311, 233, 155].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.06, 0, i * 0.16)); break;
    }
  },
};
