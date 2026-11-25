// 헤드리스 밸런스 봇 — 화면 없이 Game.update()만 돌려 맵별 도달 웨이브와 새는 적을 기록한다.
// (봇 구현은 tools/sim.js — balance.js와 compare-branches.js가 공유한다)
//   node tools/balance.js [mix|a|b]        맵 3종 시뮬레이션 결과 출력
//   node tools/balance.js check            밸런스 회귀 검사 (임계값 밴드 위반 시 종료 코드 1, CI용)
const { MAPS, sim } = require('./sim.js');
const policy = process.argv[2] || 'mix';

// ── mix|a|b: 정책별 3맵 진단 출력 ─────────────────────────────
if (policy === 'mix' || policy === 'a' || policy === 'b') {
  const order = ['pulse', 'pulse', 'mortar', 'frost', 'tesla', 'pulse', 'mortar', 'rail', 'tesla', 'pulse'];
  for (const m of MAPS) console.log(sim(m, order, policy).line);
}

// ── check: 밸런스 회귀 검사 ───────────────────────────────────
// 수치를 조정한 뒤엔 실측 결과를 보고 이 밴드를 다시 맞춘다. CI(node tools/balance.js check)에서 실행된다.
// · 개활지·협곡(mix): 30웨이브 방어 성공 + 내구도 3 이상 — 미로 없는 봇 기준 최소 실력선
// · 코어 포위(mix): 웨이브 18 도달 — 4입구 맵은 봇(대공 부재)으로는 깨기 어렵다는 점을 반영한 하한선
if (policy === 'check') {
  const order = ['pulse', 'pulse', 'mortar', 'frost', 'tesla', 'pulse', 'mortar', 'rail', 'tesla', 'pulse'];
  const bands = [
    { id: 'field',  ok: r => r.state === 'won' && r.lives >= 3 },
    { id: 'canyon', ok: r => r.state === 'won' && r.lives >= 3 },
    { id: 'siege',  ok: r => r.wave >= 18 },
  ];
  let failed = false;
  for (const m of MAPS) {
    const r = sim(m, order, 'mix');
    const pass = bands.find(b => b.id === m.id).ok(r);
    console.log(`${pass ? 'PASS' : 'FAIL'} ${r.line}`);
    if (!pass) failed = true;
  }
  if (failed) { console.error('밸런스 회귀 검사 실패 — tools/balance.js check 밴드를 확인하세요.'); process.exit(1); }
  console.log('PASS: 3맵 밸런스 밴드');
}
