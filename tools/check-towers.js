// node tools/check-towers.js — 결정성·테슬라 연쇄, 레이저·증폭기·미사일 규칙과 렌더링 검증.
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const source = ['config', 'effects', 'game', 'render']
  .map(name => fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8')).join('\n');
const sandbox = { performance, Math, window: {}, Image: class { constructor() { this.naturalWidth = 0; } } };
vm.createContext(sandbox);
vm.runInContext(source + '\nglobalThis.exports = { Game, MAPS, TOWERS, render, drawTower };', sandbox);
const { Game, MAPS, TOWERS, render, drawTower } = sandbox.exports;

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);
function setup() {
  const game = new Game(MAPS[0]);
  game.gold = 1e6; game.wave = 12;
  return game;
}
// 이동하지 않는 큰 체력의 표적
function dummy(game, type, x, y) {
  game.spawn(type, 0);
  const e = game.enemies[game.enemies.length - 1];
  Object.assign(e, { x, y, hp: 1e6, maxHp: 1e6, armor: 0 });
  return e;
}

// 레이저: 같은 대상을 비출수록 rampT초에 걸쳐 ramp배까지 오르고, 대상이 바뀌면 처음부터 다시 쌓는다.
{
  const game = setup();
  const t = game.build('laser', 5, 7), s = TOWERS.laser.levels[0];
  const a = dummy(game, 'grunt', t.x + 60, t.y), b = dummy(game, 'grunt', t.x + 30, t.y);
  t.mode = 'close';
  const ticks = [];
  for (let i = 0; i <= s.rampT / s.rate + 2; i++) {
    const before = a.hp + b.hp;
    game.updateTower(t, s.rate);
    ticks.push(before - a.hp - b.hp);
  }
  assert.equal(t.lock, b, '근접 모드는 가까운 대상을 먼저 잡는다');
  near(ticks[0], s.dmg, '첫 틱은 기본 피해');
  near(ticks[ticks.length - 1], s.dmg * s.ramp, '최대 배율에서 멈춘다');
  for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i] >= ticks[i - 1] - 1e-9, '배율은 줄지 않는다');

  b.x = t.x + 10; game.updateTower(t, s.rate);
  assert.equal(t.lock, b, '살아 있고 사거리 안이면 대상을 놓지 않는다');
  b.alive = false;
  const before = a.hp;
  game.updateTower(t, s.rate);
  assert.equal(t.lock, a);
  near(before - a.hp, s.dmg, '대상이 바뀌면 배율이 초기화된다');
  a.x = t.x + s.range + 50;
  game.updateTower(t, s.rate);
  assert.equal(t.lock, null, '사거리를 벗어나면 조준을 푼다');
  assert.equal(t.beams.length, 0);
}

// 분광: 주 대상과 나머지 둘을 함께 비춘다.
{
  const game = setup();
  const t = game.build('laser', 5, 7);
  game.upgrade(t); game.upgrade(t, 1);
  const es = [0, 1, 2, 3].map(i => dummy(game, 'grunt', t.x + 20 + i * 15, t.y));
  game.updateTower(t, 0.25);
  assert.equal(t.beams.length, 3);
  assert.equal(new Set(t.beams).size, 3);
  assert.equal(es.filter(e => e.hp < e.maxHp).length, 3);
}

// 증폭기: 주변 타워만 강화하고, 여러 개여도 가장 강한 것 하나만 적용하며, 증폭기끼리는 강화하지 않는다.
{
  const game = setup();
  const pulse = game.build('pulse', 8, 7), amp = game.build('amp', 9, 7), far = game.build('pulse', 15, 7);
  game.applyBuffs();
  near(pulse.buff, 0.2, '인접 타워 강화');
  assert.equal(far.buff, 0, '범위 밖은 강화하지 않는다');
  assert.equal(amp.buff, 0, '증폭기는 강화받지 않는다');
  assert.deepEqual([...amp.links], [pulse]);

  const amp2 = game.build('amp', 8, 8);
  game.upgrade(amp2);
  game.applyBuffs();
  near(pulse.buff, 0.3, '중첩 대신 가장 강한 증폭');
  near(game.buffed(pulse).dmg, TOWERS.pulse.levels[0].dmg * 1.3, '실제 피해에 반영');

  const target = dummy(game, 'grunt', pulse.x + 40, pulse.y);
  game.updateTower(pulse, 0.01);
  near(game.shots[0].dmg, TOWERS.pulse.levels[0].dmg * 1.3, '발사체 피해에 반영');
  assert.equal(game.shots[0].target, target);

  game.sell(amp); game.sell(amp2);
  game.applyBuffs();
  assert.equal(pulse.buff, 0, '판매하면 강화가 사라진다');
}

// 공명장: 두 칸 거리까지 닿고 연사도 빨라진다.
{
  const game = setup();
  const amp = game.build('amp', 8, 7), pulse = game.build('pulse', 10, 7);
  game.applyBuffs();
  assert.equal(pulse.buff, 0, '기본 범위는 바로 옆만');
  game.upgrade(amp); game.upgrade(amp, 1);
  game.applyBuffs();
  near(pulse.buff, 0.3, '공명장 범위');
  dummy(game, 'grunt', pulse.x + 40, pulse.y);
  game.updateTower(pulse, 0.01);
  near(pulse.cd, TOWERS.pulse.levels[0].rate / 1.2, '연사 +20%');
}

// 미사일: 공중 적에게 air배, 대상이 먼저 죽어도 마지막 위치에서 터진다.
function flyMissiles(game) {
  for (let i = 0; i < 600 && game.shots.length; i++) {
    for (const s of game.shots) game.updateShot(s, 1 / 60);
    game.shots = game.shots.filter(s => !s.dead);
  }
  assert.equal(game.shots.length, 0, '미사일이 착탄한다');
}
{
  const game = setup();
  const t = game.build('missile', 5, 7), s = TOWERS.missile.levels[0];
  const flyer = dummy(game, 'flyer', t.x + 100, t.y);
  game.updateTower(t, 0.01);
  flyMissiles(game);
  near(flyer.maxHp - flyer.hp, s.dmg * s.air, '공중 피해 배율');

  const ground = dummy(game, 'grunt', t.x + 100, t.y + 20);
  t.cd = 0; flyer.alive = false;
  game.updateTower(t, 0.01);
  const shot = game.shots[0];
  assert.equal(shot.target, ground);
  ground.alive = false;
  const bystander = dummy(game, 'grunt', ground.x, ground.y);
  flyMissiles(game);
  near(bystander.maxHp - bystander.hp, s.dmg, '죽은 대상의 자리에서 지상 피해 1배');
}

// EMP: 착탄 범위의 실드를 벗기고 3초 동안 재생을 막는다.
{
  const game = setup();
  const t = game.build('missile', 5, 7);
  game.upgrade(t); game.upgrade(t, 1);
  const e = dummy(game, 'shield', t.x + 100, t.y);
  e.maxShield = e.shield = 500;
  game.updateTower(t, 0.01);
  flyMissiles(game);
  assert.equal(e.shield, 0);
  assert.ok(e.hp < e.maxHp, '실드가 아니라 체력이 깎인다');
  e.stunT = 10;
  game.updateEnemy(e, 2.5);
  assert.equal(e.shield, 0, '일반 피격의 2.5초가 지나도 재생하지 않는다');
  game.updateEnemy(e, 1);
  assert.ok(e.shield > 0, '3초 뒤에는 다시 재생한다');
}

// 미사일: 건설·강화에 실제 쓴 골드가 누적되고, 단계마다 정확히 70%를 내림해 환급한다.
// 90G × 0.7은 62.99999999999999가 되므로 Lv.1 판매가 62G로 깎이는 회귀도 잡는다.
for (const upgrades of [[], [undefined], [undefined, 0], [undefined, 1]]) {
  const game = setup(), initialGold = game.gold;
  const tower = game.build('missile', 5, 7);
  for (const branch of upgrades) assert.equal(game.upgrade(tower, branch), true);
  assert.equal(tower.spent, initialGold - game.gold, '누적 비용은 실제 지출과 일치한다');
  const beforeSell = game.gold;
  const expectedRefund = Number(BigInt(tower.spent) * 70n / 100n);
  game.sell(tower);
  assert.equal(game.gold - beforeSell, expectedRefund, '70% 환급은 부동소수점 내림 오차가 없다');
  assert.equal(game.towerAt(5, 7), undefined, '판매한 타워는 제거된다');
}
// 키는 1부터 겹치지 않게 이어지고, 모든 단계와 특화를 그리고, 전장 렌더링도 깨지지 않는다.
assert.deepEqual(Object.values(TOWERS).map(d => d.key), Object.keys(TOWERS).map((_, i) => String(i + 1)));
const ctx = new Proxy({ save() {}, restore() {}, createRadialGradient() { return { addColorStop() {} }; } },
  { get: (o, k) => k in o ? o[k] : () => {}, set: (o, k, v) => { if (typeof v !== 'function') o[k] = v; return true; } });
for (const type of ['laser', 'amp', 'missile'])
  for (const [level, branch] of [[0, null], [1, null], [2, 0], [2, 1]]) drawTower(ctx, type, level, 100, 100, 0.5, 1, 0, branch);
{
  const game = setup();
  const laser = game.build('laser', 5, 7), missile = game.build('missile', 5, 5);
  game.build('amp', 6, 7);
  dummy(game, 'grunt', laser.x + 40, laser.y);
  game.update(1 / 60);
  assert.ok(laser.beams.length && game.shots.some(s => s.kind === 'missile') && missile.buff === 0);
  render(ctx, game, { selected: laser }, 1);
}
function clusterResult() {
  const game = setup(), tower = game.build('mortar', 5, 7);
  game.upgrade(tower); game.upgrade(tower, 0);
  game.state = 'wave';
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const e = dummy(game, 'grunt', tower.x + 80 + Math.cos(a) * 40, tower.y + Math.sin(a) * 40);
    e.stunT = 120;
  }
  for (let i = 0; i < 240; i++) game.update(1 / 60);
  return { hp: Array.from(game.enemies, e => e.hp), gold: game.gold, kills: game.kills };
}
assert.deepEqual(clusterResult(), clusterResult(), '집속탄을 포함한 같은 입력은 같은 전투 결과를 만든다');
function chainResult(branch) {
  const game = setup(), tower = game.build('tesla', 5, 7);
  if (branch != null) { game.upgrade(tower); game.upgrade(tower, branch); }
  const first = dummy(game, 'grunt', tower.x + 10, tower.y);
  const linked = dummy(game, 'grunt', first.x + 120, first.y);
  const isolated = dummy(game, 'grunt', first.x - TOWERS.tesla.branches[0].jump - 20, first.y);
  game.updateTower(tower, 0.01);
  return { linked: linked.hp, isolated: isolated.hp };
}
{
  const storm = chainResult(0), overload = chainResult(1), base = chainResult(null);
  assert.ok(storm.linked < 1e6, '폭풍은 120px 떨어진 적에게 연쇄한다');
  assert.equal(storm.isolated, 1e6, '폭풍은 점프 거리 밖의 적에게 닿지 않는다');
  assert.equal(overload.linked, 1e6, '과부하는 기존 85px 연쇄 거리를 유지한다');
  assert.equal(base.linked, 1e6, '기본 테슬라는 기존 85px 연쇄 거리를 유지한다');
}
console.log('PASS: cluster determinism, Tesla jump/chain, laser ramp/lock/reset, prism beams, amp range/no-stack/haste/sell, missile cost/air/last-position/EMP, keys and rendering.');
