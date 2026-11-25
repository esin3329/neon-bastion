// ─────────────────────────────────────────────────────────────
//  game.js — 시뮬레이션 전체 (렌더링·DOM과 완전히 분리)
//  · 플로우 필드(BFS) 경로탐색: 타워를 지을 때마다 전 맵의 최단 경로 갱신
//  · 고정 타임스텝 update(dt) — 배속과 무관하게 결과가 동일
// ─────────────────────────────────────────────────────────────
const idx = (c, r) => r * COLS + c;
const inb = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
const cx = c => c * CELL + CELL / 2;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const TARGET_MODES = { first: '선두', strong: '최강', close: '근접' };

class Game {
  constructor(map, seed = 0) {
    this.map = map;
    this.seed = seed;          // 웨이브 구성 시드 (0: 표준, 그 외: 일일 챌린지 등)
    this.grid = new Uint8Array(COLS * ROWS); // 0 빈칸, 1 바위, 2 타워
    for (const [c, r, w, h] of map.rocks)
      for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) this.grid[idx(x, y)] = 1;
    this.spawns = map.spawns;
    this.core = map.core;
    this.coreX = cx(map.core[0]); this.coreY = cx(map.core[1]);
    this.rng = mulberry32(0x6d2b79f5);
    this.towers = []; this.enemies = []; this.shots = []; this.zones = [];
    this.fx = new Effects();
    this.gold = START_GOLD; this.lives = START_LIVES;
    this.wave = 0; this.kills = 0; this.time = 0;
    this.state = 'build';      // build | wave | won | lost
    this.countdown = -1;       // 다음 웨이브 자동 시작까지 남은 시간(-1: 대기)
    this.queue = []; this.waveT = 0; this.mod = null;
    this.cds = { strike: 0, stasis: 0 };
    this.endless = false;
    this.version = 0;          // 지형이 바뀔 때마다 증가 (UI 캐시 무효화용)
    this.refreshField();
  }

  // ── 경로탐색 ────────────────────────────────────────────────
  // 코어에서 출발하는 BFS. dist[i] = 코어까지 남은 칸 수 (-1: 도달 불가)
  computeField() {
    const d = new Int16Array(COLS * ROWS).fill(-1);
    const q = [idx(this.core[0], this.core[1])];
    d[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], c = i % COLS, r = (i - c) / COLS;
      for (const [dx, dy] of DIRS) {
        const nc = c + dx, nr = r + dy;
        if (!inb(nc, nr)) continue;
        const n = idx(nc, nr);
        if (d[n] >= 0 || this.grid[n]) continue;
        d[n] = d[i] + 1; q.push(n);
      }
    }
    return d;
  }

  refreshField() {
    this.dist = this.computeField();
    this.version++;
    // 화면에 그릴 예상 경로 (입구별)
    this.paths = this.spawns.map(([c, r]) => {
      const pts = [[c, r]];
      for (let g = 0; g < COLS * ROWS; g++) {
        const n = this.nextCell(c, r);
        if (!n) break;
        [c, r] = n; pts.push(n);
      }
      return pts;
    });
  }

  // 현재 칸에서 코어에 더 가까운 이웃 칸
  nextCell(c, r) {
    let best = null, bd = this.dist[idx(c, r)];
    for (const [dx, dy] of DIRS) {
      const nc = c + dx, nr = r + dy;
      if (!inb(nc, nr)) continue;
      const d = this.dist[idx(nc, nr)];
      if (d >= 0 && d < bd) { bd = d; best = [nc, nr]; }
    }
    return best;
  }

  // ── 건설·강화 ───────────────────────────────────────────────
  towerAt(c, r) { return this.towers.find(t => t.c === c && t.r === r); }

  // 길을 완전히 막는 배치는 허용하지 않는다 (임시로 막아 보고 BFS로 검증)
  canBuild(c, r) {
    if (!inb(c, r) || this.grid[idx(c, r)]) return false;
    if (c === this.core[0] && r === this.core[1]) return false;
    if (this.spawns.some(s => s[0] === c && s[1] === r)) return false;
    const ground = this.enemies.filter(e => !e.flying);
    if (ground.some(e => (e.c === c && e.r === r) || (e.tc === c && e.tr === r))) return false;
    this.grid[idx(c, r)] = 2;
    const d = this.computeField();
    this.grid[idx(c, r)] = 0;
    return this.spawns.every(s => d[idx(s[0], s[1])] >= 0) &&
           ground.every(e => d[idx(e.tc, e.tr)] >= 0);
  }

  build(type, c, r) {
    const def = TOWERS[type], cost = def.levels[0].cost;
    if (this.gold < cost || !this.canBuild(c, r)) return null;
    this.gold -= cost;
    const t = { type, def, level: 0, branch: null, c, r, x: cx(c), y: cx(r), cd: 0, ang: -Math.PI / 2, mode: 'first', spent: cost, dealt: 0, flash: 0,
      buff: 0, haste: 0, links: [], lock: null, lockT: 0, beams: [] };
    this.towers.push(t);
    this.grid[idx(c, r)] = 2;
    this.refreshField();
    this.fx.ring(t.x, t.y, 30, def.color);
    Sfx.play('build');
    return t;
  }

  // 현재 레벨의 능력치 (3레벨은 고른 특화의 능력치)
  stats(t) { return t.level < 2 ? t.def.levels[t.level] : t.def.branches[t.branch]; }

  // 증폭기 효과까지 반영한 실제 능력치
  buffed(t) {
    const s = this.stats(t);
    if (!t.buff && !t.haste) return s;
    const m = 1 + t.buff;
    return { ...s, dmg: s.dmg * m, cdmg: s.cdmg && s.cdmg * m, burn: s.burn && s.burn * m, rate: s.rate && s.rate / (1 + t.haste) };
  }

  // 증폭기 범위 안의 타워마다 가장 강한 증폭 하나만 적용한다
  applyBuffs() {
    for (const t of this.towers) { t.buff = 0; t.haste = 0; t.links = []; }
    for (const a of this.towers) {
      if (!a.def.support) continue;
      const s = this.stats(a);
      for (const t of this.towers) {
        if (t.def.support || Math.hypot(t.x - a.x, t.y - a.y) > s.range) continue;
        t.buff = Math.max(t.buff, s.buff); t.haste = Math.max(t.haste, s.haste || 0);
        a.links.push(t);
      }
    }
  }

  // 1레벨 → 2레벨은 단일 강화, 2레벨 → 3레벨은 특화 b(0 또는 1)를 골라야 한다
  upgradeCost(t, b = 0) {
    if (t.level === 0) return t.def.levels[1].cost;
    if (t.level === 1) return t.def.branches[b].cost;
    return null;
  }

  upgrade(t, b) {
    if (t.level === 1 && b == null) return false;
    const cost = this.upgradeCost(t, b || 0);
    if (cost == null || this.gold < cost) return false;
    this.gold -= cost; t.spent += cost;
    if (t.level === 1) t.branch = b;
    t.level++; t.cd = 0;
    this.fx.ring(t.x, t.y, 36, '#ffffff');
    this.fx.burst(t.x, t.y, t.def.color, 14, 90);
    if (t.branch != null) this.fx.text(t.x, t.y - 22, t.def.branches[t.branch].name, '#ffd166');
    Sfx.play('upgrade');
    return true;
  }

  sell(t) {
    this.gold += Math.floor(t.spent * (SELL_RATIO * 100) / 100);
    this.towers.splice(this.towers.indexOf(t), 1);
    this.grid[idx(t.c, t.r)] = 0;
    this.refreshField();
    this.fx.burst(t.x, t.y, '#ffd166', 12, 100);
    Sfx.play('sell');
  }

  // ── 액티브 스킬 ─────────────────────────────────────────────
  useSkill(id, x, y) {
    if (this.cds[id] > 0 || this.state === 'won' || this.state === 'lost') return false;
    const sk = SKILLS[id];
    if (id === 'strike') {
      const dmg = sk.power * this.hpScale(Math.max(1, this.wave));
      for (const e of this.enemies)
        if (e.alive && Math.hypot(e.x - x, e.y - y) <= sk.radius + e.def.r) this.damage(e, dmg, null, true);
      this.fx.beam([[x, -20], [x, y]], sk.color, 10, 0.35);
      this.fx.ring(x, y, sk.radius, sk.color, 0.5);
      this.fx.ring(x, y, sk.radius * 0.6, '#ffffff', 0.3);
      this.fx.burst(x, y, sk.color, 50, 260);
      this.fx.shake = 12;
      Sfx.play('boom'); Sfx.play('rail');
    } else if (id === 'stasis') {
      for (const e of this.enemies) {
        e.stasisT = Math.max(e.stasisT, e.type === 'boss' ? sk.dur / 2 : sk.dur);
        e.stunT = Math.max(e.stunT, e.stasisT);
      }
      this.fx.ring(this.coreX, this.coreY, Math.hypot(W, H), sk.color, 0.8, 'stasis');
      this.fx.text(this.coreX, this.coreY - 30, '시간 정지', sk.color);
      Sfx.play('freeze');
    }
    this.cds[id] = sk.cd;
    return true;
  }

  // ── 웨이브 ──────────────────────────────────────────────────
  startWave() {
    if (this.state !== 'build') return;
    if (this.countdown > 0) { // 조기 호출 보너스
      const bonus = Math.ceil(this.countdown) * 2;
      this.gold += bonus;
      this.fx.text(this.coreX, this.coreY - 30, `조기 호출 +${bonus}`, '#ffd166');
    }
    this.wave++;
    const wv = genWave(this.wave, this.seed);
    this.mod = wv.mod;
    this.queue = [];
    wv.groups.forEach((g, gi) => {
      for (let i = 0; i < g.count; i++)
        this.queue.push({ t: g.delay + i * g.gap, type: g.type, spawn: (gi + i) % this.spawns.length });
    });
    this.queue.sort((a, b) => a.t - b.t);
    this.waveT = 0; this.countdown = -1;
    this.state = 'wave';
    if (this.mod) this.fx.text(this.coreX, this.coreY - 46, `변이: ${MODS[this.mod].name}`, MODS[this.mod].color);
    Sfx.play(this.wave % 10 === 0 ? 'boss' : 'wave');
  }

  // 적 체력 배율: 웨이브 곡선 × 맵 배율 (맵 배율은 20웨이브에 걸쳐 서서히 적용 — 초반 학습 구간은 모든 맵이 비슷하게)
  hpScale(w) { return hpMult(w) * (1 + ((this.map.hp || 1) - 1) * Math.min(1, (w - 1) / 20)); }

  // from: 분열체처럼 다른 적의 위치에서 태어날 때 그 적
  spawn(type, si, from) {
    const def = ENEMIES[type], mod = this.mod;
    let m = this.hpScale(this.wave);
    if (mod === 'haste') m *= 0.85;
    if (mod === 'horde') m *= 0.7;
    const hp = def.hp * m;
    const e = {
      type, def, hp, maxHp: hp,
      armor: (def.armor || 0) * (1 + this.wave * 0.08) + (mod === 'armored' ? 2 + this.wave * 0.1 : 0),
      speedMul: mod === 'haste' ? 1.3 : 1, regen: mod === 'regen' ? 0.02 : 0,
      maxShield: hp * ((def.shield || 0) + (mod === 'shielded' ? 0.4 : 0)), shieldT: 0,
      flying: !!def.flying, slow: 0, slowT: 0, stunT: 0, stasisT: 0, healFxT: 0, vuln: 0, vulnT: 0, hitT: 0, prog: 0, ang: 0, alive: true,
      ox: (Math.random() - 0.5) * 14, oy: (Math.random() - 0.5) * 14, // 겹침 방지용 시각 오프셋
    };
    e.shield = e.maxShield;
    if (from) {
      Object.assign(e, { x: from.x, y: from.y, c: from.c, r: from.r, tc: from.tc, tr: from.tr, prog: from.prog });
      e.ox = from.ox + (Math.random() - 0.5) * 16; e.oy = from.oy + (Math.random() - 0.5) * 16;
    } else {
      const [c, r] = this.spawns[si];
      Object.assign(e, { x: cx(c), y: cx(r), c, r, tc: c, tr: r });
    }
    this.enemies.push(e);
  }

  // ── 메인 업데이트 ───────────────────────────────────────────
  update(dt) {
    this.time += dt;
    if (this.state === 'build' && this.countdown > 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.startWave();
    }
    if (this.state === 'wave') {
      this.waveT += dt;
      for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);
      while (this.queue.length && this.queue[0].t <= this.waveT) {
        const q = this.queue.shift();
        this.spawn(q.type, q.spawn);
      }
    }
    for (const e of this.enemies) this.updateEnemy(e, dt);
    for (const z of this.zones) this.updateZone(z, dt);
    this.applyBuffs();
    for (const t of this.towers) this.updateTower(t, dt);
    for (const s of this.shots) this.updateShot(s, dt);
    this.enemies = this.enemies.filter(e => e.alive);
    this.shots = this.shots.filter(s => !s.dead);
    this.zones = this.zones.filter(z => z.t > 0);
    this.fx.update(dt);

    if (this.lives <= 0 && this.state !== 'lost') {
      this.lives = 0; this.state = 'lost';
      this.fx.shake = 14; Sfx.play('lose');
    } else if (this.state === 'wave' && !this.queue.length && !this.enemies.length) {
      const bonus = 20 + this.wave * 3, interest = Math.min(INTEREST_CAP, Math.floor(this.gold * INTEREST));
      this.gold += bonus + interest;
      this.fx.text(this.coreX, this.coreY - 30, `웨이브 클리어 +${bonus}`, '#80ed99');
      if (interest) this.fx.text(this.coreX, this.coreY - 14, `이자 +${interest}`, '#ffd166');
      this.mod = null;
      if (this.wave === TOTAL_WAVES && !this.endless) { this.state = 'won'; Sfx.play('win'); }
      else { this.state = 'build'; this.countdown = 10; }
    }
  }

  updateEnemy(e, dt) {
    if (!e.alive) return;
    e.hitT -= dt; e.slowT -= dt; e.stunT -= dt; e.stasisT -= dt; e.healFxT -= dt; e.vulnT -= dt; e.shieldT -= dt;
    if (e.regen) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.regen * dt);
    if (e.maxShield && e.shieldT <= 0) e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.25 * dt);
    if (e.stunT > 0) return; // 빙결·시간 정지 중에는 이동도 능력도 멈춘다

    let step = e.def.speed * e.speedMul * (e.slowT > 0 ? 1 - e.slow : 1) * dt;
    if (e.flying) { // 공중: 미로를 무시하고 코어로 직선 비행
      const dx = this.coreX - e.x, dy = this.coreY - e.y, d = Math.hypot(dx, dy);
      e.prog = d; e.ang = Math.atan2(dy, dx);
      if (d <= step + 2) return this.leak(e);
      e.x += dx / d * step; e.y += dy / d * step;
    } else {       // 지상: 플로우 필드를 따라 칸 중심에서 칸 중심으로
      while (step > 0) {
        const tx = cx(e.tc), ty = cx(e.tr), dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
        if (d > step) {
          e.x += dx / d * step; e.y += dy / d * step;
          e.ang = Math.atan2(dy, dx);
          e.prog = this.dist[idx(e.tc, e.tr)] * CELL + d - step;
          break;
        }
        e.x = tx; e.y = ty; step -= d; e.c = e.tc; e.r = e.tr;
        if (e.c === this.core[0] && e.r === this.core[1]) return this.leak(e);
        const n = this.nextCell(e.c, e.r);
        if (!n) break;
        [e.tc, e.tr] = n;
      }
    }

    if (e.def.heal) { // 힐러: 주변 아군 회복
      const amt = e.def.heal * hpMult(this.wave) * dt;
      let healed = false;
      for (const o of this.enemies) {
        if (o !== e && o.alive && o.hp < o.maxHp && Math.hypot(o.x - e.x, o.y - e.y) < 70) {
          o.hp = Math.min(o.maxHp, o.hp + amt);
          healed = true;
        }
      }
      if (healed && amt > 0 && e.healFxT <= 0) {
        this.fx.ring(e.x + e.ox, e.y + e.oy, 70, e.def.color, 0.8, 'heal');
        e.healFxT = 0.9;
      }
    }
  }

  leak(e) {
    e.alive = false;
    this.lives -= e.def.leak || 1;
    this.fx.shake = Math.max(this.fx.shake, 8);
    this.fx.ring(this.coreX, this.coreY, 50, '#ff5d73');
    this.fx.burst(this.coreX, this.coreY, '#ff5d73', 18, 160);
    Sfx.play('leak');
  }

  // src: 피해를 준 타워 (누적 피해 통계용) / pierce: 방어 무시 / quiet: 피격 깜빡임 생략(지속 피해)
  damage(e, dmg, src, pierce, quiet) {
    if (!e.alive) return;
    let d = pierce ? dmg : Math.max(dmg * 0.15, dmg - e.armor);
    if (e.vulnT > 0) d *= 1 + e.vuln;
    if (e.maxShield) e.shieldT = SHIELD_REGEN_DELAY;
    if (e.shield > 0) {
      const a = Math.min(e.shield, d);
      e.shield -= a; d -= a;
      if (src) src.dealt += a;
    }
    if (src) src.dealt += Math.min(e.hp, d);
    e.hp -= d;
    if (!quiet) e.hitT = 0.08;
    if (e.hp > 0) return;

    e.alive = false;
    this.kills++;
    this.gold += e.def.reward;
    const boss = e.type === 'boss';
    this.fx.burst(e.x, e.y, e.def.color, boss ? 60 : 8 + e.def.r, boss ? 260 : 120);
    this.fx.text(e.x, e.y - 12, `+${e.def.reward}`, '#ffd166');
    if (boss) { this.fx.shake = 12; this.fx.ring(e.x, e.y, 90, e.def.color, 0.6); }
    if (e.def.split) for (let i = 0; i < e.def.split; i++) this.spawn('swarm', 0, e);
    Sfx.play(boss ? 'boom' : 'kill');
  }

  // 타워의 조준 방식에 따라 사거리 내 목표를 좋은 순서로 n개 선택
  findTargets(t, range, n = 1) {
    const list = [];
    for (const e of this.enemies) {
      if (!e.alive || (t.def.groundOnly && e.flying)) continue;
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      if (d > range) continue;
      list.push([t.mode === 'first' ? e.prog : t.mode === 'strong' ? -e.hp : d, e]);
    }
    if (n === 1) { // 흔한 경우는 정렬 없이 최솟값만
      let best = null;
      for (const p of list) if (!best || p[0] < best[0]) best = p;
      return best ? [best[1]] : [];
    }
    return list.sort((a, b) => a[0] - b[0]).slice(0, n).map(p => p[1]);
  }

  updateTower(t, dt) {
    if (t.def.support) return;
    const s = this.buffed(t);
    t.cd -= dt; t.flash -= dt;

    if (t.type === 'laser') { // 주 대상이 살아서 사거리 안에 있는 동안 놓지 않고 배율을 쌓는다
      const keep = t.lock?.alive && Math.hypot(t.lock.x - t.x, t.lock.y - t.y) <= s.range;
      if (keep) t.lockT += dt;
      else {
        t.lock = this.findTargets(t, s.range)[0] || null; t.lockT = 0;
        if (t.lock) Sfx.play('laser');
      }
      t.beams = !t.lock ? [] : s.multi
        ? [t.lock, ...this.findTargets(t, s.range, s.multi).filter(e => e !== t.lock).slice(0, s.multi - 1)] : [t.lock];
      if (!t.lock) return;
      t.ang = Math.atan2(t.lock.y - t.y, t.lock.x - t.x);
      if (t.cd > 0) return;
      t.cd = s.rate;
      const dmg = s.dmg * (1 + (s.ramp - 1) * Math.min(1, t.lockT / s.rampT));
      for (const e of t.beams) this.damage(e, dmg, t, false, true);
      return;
    }

    if (t.type === 'frost') { // 오라: 매 프레임 범위 내 전체에 감속 + 지속 피해
      const inRange = this.enemies.filter(e => e.alive && Math.hypot(e.x - t.x, e.y - t.y) <= s.range);
      const freeze = s.freeze && t.cd <= 0 && inRange.length > 0;
      for (const e of inRange) {
        if (e.slowT <= 0 || s.slow >= e.slow) e.slow = s.slow;
        e.slowT = 0.25;
        if (s.vuln) { e.vuln = Math.max(e.vulnT > 0 ? e.vuln : 0, s.vuln); e.vulnT = 0.25; }
        if (freeze) e.stunT = Math.max(e.stunT, e.type === 'boss' ? s.freeze / 2 : s.freeze);
        this.damage(e, s.dmg * dt, t, true, true);
      }
      if (freeze) {
        t.cd = s.every; t.flash = 0.15;
        this.fx.ring(t.x, t.y, s.range, '#ffffff', 0.45);
        this.fx.burst(t.x, t.y, t.def.color, 20, 160);
        Sfx.play('freeze');
      }
      return;
    }

    const targets = this.findTargets(t, s.range, s.multi || 1), target = targets[0];
    if (target) t.ang = Math.atan2(target.y - t.y, target.x - t.x);
    if (t.cd > 0 || !target) return;
    t.cd = s.rate; t.flash = 0.06;
    const muzzle = s.sprite?.muzzle ?? 16;
    const mx = t.x + Math.cos(t.ang) * muzzle, my = t.y + Math.sin(t.ang) * muzzle;

    switch (t.type) {
      case 'pulse':
        for (const tg of targets)
          this.shots.push({ kind: 'bullet', x: mx, y: my, target: tg, dmg: s.dmg, color: t.def.color, src: t });
        Sfx.play('pulse');
        break;
      case 'missile':
        for (const tg of targets)
          this.shots.push({ kind: 'missile', x: mx, y: my, ang: t.ang, target: tg, tx: tg.x, ty: tg.y,
            dmg: s.dmg, splash: s.splash, air: s.air, emp: s.emp, color: t.def.color, src: t });
        Sfx.play('missile');
        break;
      case 'mortar': {
        const d = Math.hypot(target.x - t.x, target.y - t.y);
        this.shots.push({ kind: 'shell', sx: mx, sy: my, x: mx, y: my, tx: target.x, ty: target.y, t: 0, dur: 0.3 + d / 420,
          dmg: s.dmg, splash: s.splash, color: t.def.color, src: t, cluster: s.cluster, cdmg: s.cdmg, burn: s.burn, burnT: s.burnT });
        Sfx.play('mortar');
        break;
      }
      case 'tesla': { // 가장 가까운 미타격 적으로 연쇄, 튈 때마다 피해 감소
        const hit = new Set(); let cur = target, dmg = s.dmg, px = t.x, py = t.y;
        for (let i = 0; i < s.chain && cur; i++) {
          hit.add(cur);
          this.fx.bolt(px, py, cur.x, cur.y, t.def.color);
          if (s.shred) cur.armor = Math.max(0, cur.armor - s.shred);
          this.damage(cur, dmg, t, false);
          px = cur.x; py = cur.y; dmg *= s.decay || 0.75;
          let next = null, nd = s.jump || 85;
          for (const e of this.enemies) {
            if (!e.alive || hit.has(e)) continue;
            const d = Math.hypot(e.x - px, e.y - py);
            if (d < nd) { nd = d; next = e; }
          }
          cur = next;
        }
        Sfx.play('tesla');
        break;
      }
      case 'rail': { // 선분-원 충돌로 직선상의 모든 적 관통
        const len = s.range + 40, ex = t.x + Math.cos(t.ang) * len, ey = t.y + Math.sin(t.ang) * len;
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const u = Math.max(0, Math.min(1, ((e.x - t.x) * (ex - t.x) + (e.y - t.y) * (ey - t.y)) / (len * len)));
          if (Math.hypot(e.x - (t.x + (ex - t.x) * u), e.y - (t.y + (ey - t.y) * u)) > e.def.r + 7) continue;
          this.damage(e, s.dmg, t, true);
          this.fx.burst(e.x, e.y, t.def.color, 5, 80);
          if (s.execute && e.alive && e.type !== 'boss' && e.hp < e.maxHp * s.execute) {
            this.fx.text(e.x, e.y - 22, '처형', t.def.color);
            this.damage(e, e.hp + e.shield + 1, t, true);
          }
        }
        this.fx.beam([[mx, my], [ex, ey]], t.def.color, s.rate < 1 ? 3 : 5, s.rate < 1 ? 0.16 : 0.28);
        this.fx.shake = Math.max(this.fx.shake, s.rate < 1 ? 1 : 2.5);
        Sfx.play('rail');
        break;
      }
    }
  }

  updateZone(z, dt) { // 네이팜 불길: 지상 적에게 방어 무시 지속 피해
    z.t -= dt;
    for (const e of this.enemies)
      if (e.alive && !e.flying && Math.hypot(e.x - z.x, e.y - z.y) <= z.r + e.def.r) this.damage(e, z.dps * dt, z.src, true, true);
  }

  updateShot(s, dt) {
    if (s.kind === 'bullet') { // 유도탄
      if (!s.target.alive) { s.dead = true; return; }
      const dx = s.target.x - s.x, dy = s.target.y - s.y, d = Math.hypot(dx, dy), step = 480 * dt;
      if (d <= step + s.target.def.r) {
        this.damage(s.target, s.dmg, s.src, false);
        this.fx.burst(s.x, s.y, s.color, 3, 60);
        s.dead = true;
      } else { s.x += dx / d * step; s.y += dy / d * step; }
      return;
    }
    if (s.kind === 'missile') { // 유도 미사일: 대상이 먼저 죽으면 마지막 위치에서 터진다
      if (s.target.alive) { s.tx = s.target.x; s.ty = s.target.y; }
      const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), step = 300 * dt;
      s.ang = Math.atan2(dy, dx);
      if (d > step + 4) { s.x += dx / d * step; s.y += dy / d * step; return; }
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const r = Math.hypot(e.x - s.tx, e.y - s.ty);
        if (r > s.splash + e.def.r) continue;
        if (s.emp && e.maxShield) e.shield = 0;
        this.damage(e, s.dmg * (e.flying ? s.air : 1) * (1 - 0.5 * Math.min(1, r / s.splash)), s.src, false);
        if (s.emp && e.maxShield) e.shieldT = Math.max(e.shieldT, s.emp); // damage()가 넣은 2초보다 길게 재생을 막는다
      }
      this.fx.ring(s.tx, s.ty, s.splash, s.emp ? '#48cae4' : s.color, 0.3);
      this.fx.burst(s.tx, s.ty, s.color, 10, 130);
      Sfx.play('boom');
      s.dead = true;
      return;
    }
    // 포물선 포탄 → 착탄 시 범위 피해 (거리에 따라 감쇠)
    s.t += dt / s.dur;
    const k = Math.min(1, s.t);
    s.x = s.sx + (s.tx - s.sx) * k;
    s.y = s.sy + (s.ty - s.sy) * k - Math.sin(k * Math.PI) * (s.sub ? 14 : 34);
    if (k < 1) return;
    for (const e of this.enemies) {
      if (!e.alive || e.flying) continue;
      const d = Math.hypot(e.x - s.tx, e.y - s.ty);
      if (d <= s.splash + e.def.r) this.damage(e, s.dmg * (1 - 0.5 * Math.min(1, d / s.splash)), s.src, false);
    }
    if (s.cluster) for (let i = 0; i < s.cluster; i++) { // 자탄 산개
      const a = i / s.cluster * TAU_G + this.rng() * 0.6;
      this.shots.push({ kind: 'shell', sub: true, sx: s.tx, sy: s.ty, x: s.tx, y: s.ty, tx: s.tx + Math.cos(a) * 40, ty: s.ty + Math.sin(a) * 40,
        t: 0, dur: 0.22, dmg: s.cdmg, splash: 30, color: s.color, src: s.src });
    }
    if (s.burn) this.zones.push({ x: s.tx, y: s.ty, r: s.splash, dps: s.burn, t: s.burnT, max: s.burnT, src: s.src });
    this.fx.ring(s.tx, s.ty, s.splash, s.color, 0.3);
    this.fx.burst(s.tx, s.ty, s.color, s.sub ? 6 : 14, s.sub ? 90 : 150);
    this.fx.shake = Math.max(this.fx.shake, s.sub ? 0.5 : 1.5);
    Sfx.play('boom');
    s.dead = true;
  }
}
const TAU_G = Math.PI * 2;
