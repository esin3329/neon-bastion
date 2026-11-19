// node tools/check-effects.js — 회복·정지의 지속시간, 중첩, 이미지 로딩 실패를 검증한다.
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const source = ['config', 'effects', 'game', 'render']
  .map(name => fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8')).join('\n');
const sandbox = { performance, Math, window: {}, Image: class { constructor() { this.naturalWidth = 256; } } };
vm.createContext(sandbox);
vm.runInContext(source + '\nglobalThis.exports = { Game, MAPS, SCENE_SPRITES, sceneSprites, render, drawEnemy };', sandbox);
const { Game, MAPS, SCENE_SPRITES, sceneSprites, render, drawEnemy } = sandbox.exports;

// 실제 회복이 없으면 펄스도 없고, 회복 중에도 프레임마다 효과를 쌓지 않는다.
{
  const game = new Game(MAPS[0]);
  game.wave = 9;
  game.spawn('healer', 0); game.spawn('grunt', 0);
  const [healer, ally] = game.enemies;
  game.updateEnemy(healer, 0.01);
  assert.equal(game.fx.rings.length, 0);
  ally.hp -= 10;
  game.updateEnemy(healer, 0);
  assert.equal(game.fx.rings.length, 0);
  const before = ally.hp;
  game.updateEnemy(healer, 0.01);
  assert.ok(ally.hp > before);
  assert.equal(game.fx.rings.length, 1);
  assert.equal(game.fx.rings[0].sprite, 'heal');
  for (let i = 0; i < 50; i++) game.updateEnemy(healer, 0.01);
  assert.equal(game.fx.rings.length, 1);
  game.fx.update(0.9);
  ally.hp = ally.maxHp;
  game.updateEnemy(healer, 0.9);
  assert.equal(game.fx.rings.length, 0);
  ally.hp -= 1;
  ally.x = healer.x + 100; ally.y = healer.y;
  game.updateEnemy(healer, 0.01);
  assert.equal(game.fx.rings.length, 0);
  ally.x = healer.x + 20; ally.y = healer.y;
  game.updateEnemy(healer, 0.01);
  assert.equal(game.fx.rings.length, 1);
}

// 시간 정지 표시가 끝나도 더 오래 남은 빙결은 유지하며, 보스는 절반만 정지한다.
{
  const game = new Game(MAPS[0]);
  game.spawn('grunt', 0); game.spawn('boss', 0);
  const [grunt, boss] = game.enemies;
  grunt.stunT = 4;
  assert.ok(game.useSkill('stasis'));
  assert.equal(grunt.stasisT, 3);
  assert.equal(grunt.stunT, 4);
  assert.equal(boss.stasisT, 1.5);
  assert.equal(game.useSkill('stasis'), false);
  const x = grunt.x, y = grunt.y;
  game.updateEnemy(grunt, 3.1);
  assert.ok(grunt.stasisT <= 0 && grunt.stunT > 0);
  assert.equal(grunt.x, x); assert.equal(grunt.y, y);
  game.updateEnemy(boss, 1.6);
  assert.ok(boss.stasisT <= 0 && boss.stunT <= 0);
  game.fx.update(1);
  assert.equal(game.fx.rings.length, 0);
}

const calls = [], stack = [];
const ctx = {
  globalAlpha: 1, globalCompositeOperation: 'source-over',
  save() { stack.push([this.globalAlpha, this.globalCompositeOperation]); },
  restore() { [this.globalAlpha, this.globalCompositeOperation] = stack.pop(); },
  drawImage(image, ...args) { calls.push({ src: image.src, args, alpha: this.globalAlpha }); },
  createRadialGradient() { return { addColorStop() {} }; },
};
for (const name of ['setTransform', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arcTo',
  'fill', 'stroke', 'fillRect', 'strokeRect', 'arc', 'ellipse', 'setLineDash', 'fillText', 'translate', 'rotate']) ctx[name] = () => {};

const game = new Game(MAPS[0]);
game.wave = 9;
game.spawn('healer', 0); game.spawn('grunt', 0);
game.enemies[1].hp -= 10;
game.updateEnemy(game.enemies[0], 0.01);
game.useSkill('stasis');
render(ctx, game, {}, 1);
for (const src of Object.values(SCENE_SPRITES)) {
  assert.ok(fs.existsSync(path.join(root, src)), src);
  assert.ok(calls.some(call => call.src === src), 'Missing rendered sprite ' + src);
}
const firstPulse = calls.find(call => call.src === SCENE_SPRITES.heal);
calls.length = 0;
game.fx.update(0.3);
render(ctx, game, {}, 1);
const nextPulse = calls.find(call => call.src === SCENE_SPRITES.heal);
assert.ok(nextPulse.args[2] > firstPulse.args[2] && nextPulse.alpha < firstPulse.alpha);
assert.equal(ctx.globalAlpha, 1);

calls.length = 0;
game.enemies[0].stasisT = 0;
game.enemies[0].stunT = 1;
drawEnemy(ctx, game.enemies[0], 0);
assert.ok(!calls.some(call => call.src === SCENE_SPRITES.stasis));
for (const image of Object.values(sceneSprites)) image.naturalWidth = 0;
calls.length = 0;
render(ctx, game, {}, 1);
assert.ok(!calls.some(call => Object.values(SCENE_SPRITES).includes(call.src)));
assert.equal(new Game(MAPS[0]).fx.rings.length, 0);
console.log('PASS: healing cadence, stasis/freeze overlap, boss duration, five assets, expansion/fade, cleanup and fallback.');
