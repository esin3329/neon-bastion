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
  constructor(map) {
    this.map = map;
    this.grid = new Uint8Array(COLS * ROWS); // 0 빈칸, 1 바위, 2 타워
    for (const [c, r, w, h] of map.rocks)
      for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) this.grid[idx(x, y)] = 1;
    this.spawns = map.spawns;
    this.core = map.core;
    this.coreX = cx(map.core[0]); this.coreY = cx(map.core[1]);
    this.towers = []; this.enemies = []; this.shots = [];
    this.fx = new Effects();
    this.gold = START_GOLD; this.lives = START_LIVES;
    this.wave = 0; this.kills = 0; this.time = 0;
    this.state = 'build';      // build | wave | won | lost
    this.countdown = -1;       // 다음 웨이브 자동 시작까지 남은 시간(-1: 대기)
    this.queue = []; this.waveT = 0;
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

  // ── 건설 ────────────────────────────────────────────────────
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
    const t = { type, def, level: 0, c, r, x: cx(c), y: cx(r), cd: 0, ang: -Math.PI / 2, mode: 'first', spent: cost, flash: 0 };
    this.towers.push(t);
    this.grid[idx(c, r)] = 2;
    this.refreshField();
    this.fx.ring(t.x, t.y, 30, def.color);
    Sfx.play('build');
    return t;
  }

  upgradeCost(t) { const n = t.def.levels[t.level + 1]; return n ? n.cost : null; }

  upgrade(t) {
    const cost = this.upgradeCost(t);
    if (cost == null || this.gold < cost) return false;
    this.gold -= cost; t.spent += cost; t.level++;
    this.fx.ring(t.x, t.y, 36, '#ffffff');
    this.fx.burst(t.x, t.y, t.def.color, 14, 90);
    Sfx.play('upgrade');
    return true;
  }

  sell(t) {
    this.gold += Math.floor(t.spent * SELL_RATIO);
    this.towers.splice(this.towers.indexOf(t), 1);
    this.grid[idx(t.c, t.r)] = 0;
    this.refreshField();
    this.fx.burst(t.x, t.y, '#ffd166', 12, 100);
    Sfx.play('sell');
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
    this.queue = [];
    genWave(this.wave).forEach((g, gi) => {
      for (let i = 0; i < g.count; i++)
        this.queue.push({ t: g.delay + i * g.gap, type: g.type, spawn: (gi + i) % this.spawns.length });
    });
    this.queue.sort((a, b) => a.t - b.t);
    this.waveT = 0; this.countdown = -1;
    this.state = 'wave';
    Sfx.play(this.wave % 10 === 0 ? 'boss' : 'wave');
  }

  spawn(type, si) {
    const def = ENEMIES[type], [c, r] = this.spawns[si], m = hpMult(this.wave) * (this.map.hp || 1);
    this.enemies.push({
      type, def, x: cx(c), y: cx(r), c, r, tc: c, tr: r,
      hp: def.hp * m, maxHp: def.hp * m, armor: (def.armor || 0) * (1 + this.wave * 0.08),
      flying: !!def.flying, slow: 0, slowT: 0, hitT: 0, prog: 0, ang: 0, alive: true,
      ox: (Math.random() - 0.5) * 14, oy: (Math.random() - 0.5) * 14, // 겹침 방지용 시각 오프셋
    });
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
      while (this.queue.length && this.queue[0].t <= this.waveT) {
        const q = this.queue.shift();
        this.spawn(q.type, q.spawn);
      }
    }
    for (const e of this.enemies) this.updateEnemy(e, dt);
    for (const t of this.towers) this.updateTower(t, dt);
    for (const s of this.shots) this.updateShot(s, dt);
    this.enemies = this.enemies.filter(e => e.alive);
    this.shots = this.shots.filter(s => !s.dead);
    this.fx.update(dt);

    if (this.lives <= 0 && this.state !== 'lost') {
      this.lives = 0; this.state = 'lost';
      this.fx.shake = 14; Sfx.play('lose');
    } else if (this.state === 'wave' && !this.queue.length && !this.enemies.length) {
      const bonus = 20 + this.wave * 3;
      this.gold += bonus;
      this.fx.text(this.coreX, this.coreY - 30, `웨이브 클리어 +${bonus}`, '#80ed99');
      if (this.wave === TOTAL_WAVES && !this.endless) { this.state = 'won'; Sfx.play('win'); }
      else { this.state = 'build'; this.countdown = 10; }
    }
  }

  updateEnemy(e, dt) {
    if (!e.alive) return;
    e.hitT -= dt; e.slowT -= dt;
    let step = e.def.speed * (e.slowT > 0 ? 1 - e.slow : 1) * dt;

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
      for (const o of this.enemies)
        if (o !== e && o.alive && o.hp < o.maxHp && Math.hypot(o.x - e.x, o.y - e.y) < 70)
          o.hp = Math.min(o.maxHp, o.hp + amt);
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

  damage(e, dmg, pierce, quiet) {
    if (!e.alive) return;
    e.hp -= pierce ? dmg : Math.max(1, dmg - e.armor);
    if (!quiet) e.hitT = 0.08;
    if (e.hp > 0) return;
    e.alive = false;
    this.kills++;
    this.gold += e.def.reward;
    this.fx.burst(e.x, e.y, e.def.color, e.type === 'boss' ? 60 : 8 + e.def.r, e.type === 'boss' ? 260 : 120);
    this.fx.text(e.x, e.y - 12, `+${e.def.reward}`, '#ffd166');
    if (e.type === 'boss') { this.fx.shake = 12; this.fx.ring(e.x, e.y, 90, e.def.color, 0.6); }
    Sfx.play(e.type === 'boss' ? 'boom' : 'kill');
  }

  // 타워의 조준 방식에 따라 사거리 내 최적 목표 선택
  findTarget(t, range) {
    let best = null, score = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || (t.def.groundOnly && e.flying)) continue;
      const d = Math.hypot(e.x - t.x, e.y - t.y);
      if (d > range) continue;
      const s = t.mode === 'first' ? e.prog : t.mode === 'strong' ? -e.hp : d;
      if (s < score) { score = s; best = e; }
    }
    return best;
  }

  updateTower(t, dt) {
    const s = t.def.levels[t.level];
    t.cd -= dt; t.flash -= dt;

    if (t.type === 'frost') { // 오라: 매 프레임 범위 내 전체에 감속 + 지속 피해
      for (const e of this.enemies) {
        if (!e.alive || Math.hypot(e.x - t.x, e.y - t.y) > s.range) continue;
        if (e.slowT <= 0 || s.slow >= e.slow) e.slow = s.slow;
        e.slowT = 0.25;
        this.damage(e, s.dmg * dt, true, true);
      }
      return;
    }

    const target = this.findTarget(t, s.range);
    if (target) t.ang = Math.atan2(target.y - t.y, target.x - t.x);
    if (t.cd > 0 || !target) return;
    t.cd = s.rate; t.flash = 0.08;
    const mx = t.x + Math.cos(t.ang) * 16, my = t.y + Math.sin(t.ang) * 16;

    switch (t.type) {
      case 'pulse':
        this.shots.push({ kind: 'bullet', x: mx, y: my, target, dmg: s.dmg, color: t.def.color });
        Sfx.play('pulse');
        break;
      case 'mortar': {
        const d = Math.hypot(target.x - t.x, target.y - t.y);
        this.shots.push({ kind: 'shell', sx: mx, sy: my, x: mx, y: my, tx: target.x, ty: target.y, t: 0, dur: 0.3 + d / 420, dmg: s.dmg, splash: s.splash, color: t.def.color });
        Sfx.play('mortar');
        break;
      }
      case 'tesla': { // 가장 가까운 미타격 적으로 연쇄, 튈 때마다 피해 25% 감소
        const hit = new Set(); let cur = target, dmg = s.dmg, px = t.x, py = t.y;
        for (let i = 0; i < s.chain && cur; i++) {
          hit.add(cur);
          this.fx.bolt(px, py, cur.x, cur.y, t.def.color);
          this.damage(cur, dmg, false);
          px = cur.x; py = cur.y; dmg *= 0.75;
          let next = null, nd = 85;
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
          if (Math.hypot(e.x - (t.x + (ex - t.x) * u), e.y - (t.y + (ey - t.y) * u)) <= e.def.r + 7) {
            this.damage(e, s.dmg, true);
            this.fx.burst(e.x, e.y, t.def.color, 5, 80);
          }
        }
        this.fx.beam([[mx, my], [ex, ey]], t.def.color, 5, 0.28);
        this.fx.shake = Math.max(this.fx.shake, 2.5);
        Sfx.play('rail');
        break;
      }
    }
  }

  updateShot(s, dt) {
    if (s.kind === 'bullet') { // 유도탄
      if (!s.target.alive) { s.dead = true; return; }
      const dx = s.target.x - s.x, dy = s.target.y - s.y, d = Math.hypot(dx, dy), step = 480 * dt;
      if (d <= step + s.target.def.r) {
        this.damage(s.target, s.dmg, false);
        this.fx.burst(s.x, s.y, s.color, 3, 60);
        s.dead = true;
      } else { s.x += dx / d * step; s.y += dy / d * step; }
    } else {                   // 포물선 포탄 → 착탄 시 범위 피해 (거리에 따라 감쇠)
      s.t += dt / s.dur;
      const k = Math.min(1, s.t);
      s.x = s.sx + (s.tx - s.sx) * k;
      s.y = s.sy + (s.ty - s.sy) * k - Math.sin(k * Math.PI) * 34;
      if (k < 1) return;
      for (const e of this.enemies) {
        if (!e.alive || e.flying) continue;
        const d = Math.hypot(e.x - s.tx, e.y - s.ty);
        if (d <= s.splash + e.def.r) this.damage(e, s.dmg * (1 - 0.5 * Math.min(1, d / s.splash)), false);
      }
      this.fx.ring(s.tx, s.ty, s.splash, s.color, 0.3);
      this.fx.burst(s.tx, s.ty, s.color, 14, 150);
      this.fx.shake = Math.max(this.fx.shake, 1.5);
      Sfx.play('boom');
      s.dead = true;
    }
  }
}
