// 헤드리스 밸런스 봇 — 화면 없이 Game.update()만 돌려 맵별 도달 웨이브와 새는 적을 기록한다.
//   node tools/balance.js [mix|a|b]   (특화 선택 전략: 번갈아 / 항상 A / 항상 B)
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..', 'js') + '/';
const code = ['config.js', 'effects.js', 'game.js'].map(f => fs.readFileSync(root + f, 'utf8')).join('\n') +
  '\n;globalThis.__ = { Game, MAPS, TOWERS, SKILLS, DIRS, inb, idx, hpMult };';
const ctx = { performance, Math, console, window: {} }; vm.createContext(ctx); vm.runInContext(code, ctx);
const { Game, MAPS, TOWERS, DIRS, inb, idx } = ctx.__;
const policy = process.argv[2] || 'mix';

function sim(map) {
  const g = new Game(map); const leaks = {}; const ol = g.leak.bind(g); g.leak = e => { const k = g.wave + e.type + (g.mod ? "(" + g.mod + ")" : ""); leaks[k] = (leaks[k] || 0) + 1; return ol(e); };
  const order = ['pulse', 'pulse', 'mortar', 'frost', 'tesla', 'pulse', 'mortar', 'rail', 'tesla', 'pulse'];
  let oi = 0, bi = 0; const log = [], picks = {};
  const branchOf = t => policy === 'a' ? 0 : policy === 'b' ? 1 : (bi++ % 2);
  const spend = () => {
    for (let guard = 0; guard < 300; guard++) {
      const ups = g.towers.filter(t => t.level < 2).sort((a, b) => a.level - b.level || a.spent - b.spent);
      const up = ups[0];
      const type = order[oi % order.length], cost = TOWERS[type].levels[0].cost;
      if (up && (g.towers.length >= 6 + g.wave || oi % 3 === 2)) {
        const b = up.level === 1 ? branchOf(up) : undefined;
        if (g.gold >= g.upgradeCost(up, b || 0)) { g.upgrade(up, b); if (b != null) picks[up.type + b] = (picks[up.type + b] || 0) + 1; oi++; continue; }
      }
      if (g.gold < cost) break;
      const all = g.paths.flat(), onPath = new Set(all.map(p => p.join())); let best = null, bs = -1e9;
      for (const p of g.paths) for (let i = 2; i < p.length - 1; i++) for (const [dx, dy] of DIRS) {
        const c = p[i][0] + dx, r = p[i][1] + dy;
        if (!inb(c, r) || onPath.has(c + ',' + r) || g.grid[idx(c, r)]) continue;
        let s = 0; for (const q of all) if (Math.hypot(q[0] - c, q[1] - r) < 3) s++;
        s -= g.towers.filter(t => Math.hypot(t.c - c, t.r - r) < 2).length * 1.5;
        if (s > bs) { bs = s; best = [c, r]; }
      }
      if (!best || !g.build(type, best[0], best[1])) break; oi++;
    }
  };
  let steps = 0;
  while (g.state !== 'won' && g.state !== 'lost' && steps < 60 * 60 * 120) {
    if (g.state === 'build') { spend(); g.startWave(); }
    if (g.state === 'wave' && steps % 30 === 0 && g.enemies.length) { // 스킬: 가장 밀집한 적에게 폭격, 코어 근처가 위험하면 정지
      if (g.cds.strike <= 0 && g.enemies.length >= 6) {
        let be = null, bn = 0;
        for (const e of g.enemies) { const n = g.enemies.filter(o => Math.hypot(o.x - e.x, o.y - e.y) < 75).length; if (n > bn) { bn = n; be = e; } }
        if (bn >= 5 || be.type === 'boss') g.useSkill('strike', be.x, be.y);
      }
      if (g.cds.stasis <= 0 && g.enemies.some(e => Math.hypot(e.x - g.coreX, e.y - g.coreY) < 140)) g.useSkill('stasis');
    }
    g.update(1 / 60); steps++;
    if (g.state === 'build' && g.countdown > 9.98) log.push(`${g.wave}:${g.lives}`);
  }
  return `${map.id.padEnd(7)} ${g.state.padEnd(4)} wave ${String(g.wave).padStart(2)} lives ${String(g.lives).padStart(2)} towers ${g.towers.length} | ${log.filter((x, i, a) => i === 0 || x.split(':')[1] !== a[i - 1].split(':')[1]).join(' ')} | ${JSON.stringify(leaks)}`;
}
for (const m of MAPS) console.log(sim(m));
