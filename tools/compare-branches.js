// 특화 동일예산 비교 — 한 타워 종류 + 한 특화만으로 30웨이브를 막아 16개 특화의 전력 격차를 정량화한다.
//   node tools/compare-branches.js [mapId]   (기본: field)
// 봇이 같은 배치·지출 규칙을 쓰므로 결과 차이는 특화 성능 차이로 읽을 수 있다.
// (단일 종족 실험은 극단적 설정 — 절대적 성능이 아니라 특화 간 상대 격차 확인용)
const { MAPS, TOWERS, sim } = require('./sim.js');
const map = MAPS.find(m => m.id === (process.argv[2] || 'field')) || MAPS[0];

const rows = [];
for (const [type, def] of Object.entries(TOWERS)) {
  if (def.support) continue; // 증폭기는 단독으로 싸울 수 없다 (공격 수단 없음)
  for (const b of [0, 1]) {
    const r = sim(map, [type], b === 0 ? 'a' : 'b');
    rows.push({ type, branch: b, name: def.branches[b].name, ...r });
    console.error(`${def.name}/${def.branches[b].name} → ${r.state} w${r.wave}`);
  }
}

rows.sort((x, y) => y.wave - x.wave || y.lives - x.lives || y.dealt - x.dealt);
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
console.log(`\n[${map.name}] 한 타워·한 특화만으로 30웨이브 (같은 배치·지출 규칙)`);
console.log('타워'.padEnd(8) + '특화'.padEnd(8) + '결과'.padEnd(7) + '웨이브'.padEnd(6) + '내구도'.padEnd(6) + '타워수'.padEnd(6) + '누적피해');
for (const r of rows)
  console.log(r.type.padEnd(8) + r.name.padEnd(8) + r.state.padEnd(7) +
    String(r.wave).padEnd(6) + String(Math.max(0, r.lives)).padEnd(6) + String(r.towers).padEnd(6) + fmt(r.dealt));

const top = rows[0], bottom = rows[rows.length - 1];
console.log(`\n최상 ${top.type}/${top.name} (w${top.wave}) ↔ 최하 ${bottom.type}/${bottom.name} (w${bottom.wave}) — 도달 웨이브 격차 ${top.wave - bottom.wave}`);
