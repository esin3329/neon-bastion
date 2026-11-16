// ─────────────────────────────────────────────────────────────
//  config.js — 모든 밸런스 수치와 콘텐츠 정의 (데이터 주도 설계)
//  새 타워·적·맵은 이 파일에 항목만 추가하면 게임에 반영된다.
// ─────────────────────────────────────────────────────────────
const CELL = 40, COLS = 24, ROWS = 14;
const W = COLS * CELL, H = ROWS * CELL;
const TOTAL_WAVES = 30;
const START_GOLD = 220, START_LIVES = 20, SELL_RATIO = 0.7;

// levels[n].cost: 0레벨은 건설비, 이후는 업그레이드 비용
const TOWERS = {
  pulse: {
    name: '펄스', key: '1', color: '#4cc9f0',
    desc: '빠른 연사. 지상·공중 모두 공격하는 기본 타워.',
    levels: [
      { cost: 50, dmg: 10, range: 120, rate: 0.50 },
      { cost: 45, dmg: 18, range: 130, rate: 0.45 },
      { cost: 90, dmg: 32, range: 145, rate: 0.38 },
    ],
  },
  mortar: {
    name: '모르타르', key: '2', color: '#ff9f1c', groundOnly: true,
    desc: '범위 폭발 포탄. 뭉친 적에게 강하지만 공중은 못 맞춘다.',
    levels: [
      { cost: 90, dmg: 24, range: 150, rate: 1.60, splash: 44 },
      { cost: 80, dmg: 44, range: 165, rate: 1.50, splash: 50 },
      { cost: 150, dmg: 80, range: 180, rate: 1.35, splash: 58 },
    ],
  },
  frost: {
    name: '프로스트', key: '3', color: '#90e0ef',
    desc: '주변 모든 적을 감속시키고 지속 피해(방어 무시)를 준다.',
    levels: [
      { cost: 70, dmg: 4, range: 85, slow: 0.30 },
      { cost: 60, dmg: 8, range: 95, slow: 0.40 },
      { cost: 110, dmg: 14, range: 110, slow: 0.50 },
    ],
  },
  tesla: {
    name: '테슬라', key: '4', color: '#c77dff',
    desc: '적에서 적으로 튀는 연쇄 번개. 무리 처리에 탁월.',
    levels: [
      { cost: 120, dmg: 16, range: 110, rate: 0.90, chain: 3 },
      { cost: 100, dmg: 26, range: 120, rate: 0.80, chain: 4 },
      { cost: 180, dmg: 42, range: 130, rate: 0.70, chain: 6 },
    ],
  },
  rail: {
    name: '레일건', key: '5', color: '#f72585', pierce: true,
    desc: '일직선상의 모든 적을 관통. 방어력을 무시하는 초장거리 저격.',
    levels: [
      { cost: 160, dmg: 90, range: 260, rate: 2.60 },
      { cost: 140, dmg: 170, range: 290, rate: 2.40 },
      { cost: 260, dmg: 320, range: 330, rate: 2.10 },
    ],
  },
};

// cost: 웨이브 예산에서 차지하는 값 / gap: 같은 그룹 내 출현 간격(초)
const ENEMIES = {
  grunt:  { name: '그런트', hp: 30,  speed: 50,  reward: 5,  r: 9,  color: '#ff5d73', shape: 'circle', unlock: 1, cost: 6,   gap: 0.70 },
  runner: { name: '러너',   hp: 18,  speed: 100, reward: 5,  r: 7,  color: '#ffd166', shape: 'tri',    unlock: 2, cost: 6,   gap: 0.45 },
  swarm:  { name: '스웜',   hp: 8,   speed: 72,  reward: 2,  r: 5,  color: '#c8b6ff', shape: 'dot',    unlock: 4, cost: 2.4, gap: 0.18 },
  tank:   { name: '탱크',   hp: 150, speed: 30,  reward: 15, r: 12, color: '#fb8500', shape: 'square', unlock: 5, cost: 20,  gap: 1.50, armor: 4 },
  flyer:  { name: '플라이어', hp: 26, speed: 62, reward: 7,  r: 8,  color: '#06d6a0', shape: 'wing',   unlock: 7, cost: 9,   gap: 0.60, flying: true },
  healer: { name: '힐러',   hp: 60,  speed: 45,  reward: 12, r: 9,  color: '#80ed99', shape: 'plus',   unlock: 9, cost: 16,  gap: 1.20, heal: 6 },
  boss:   { name: '보스',   hp: 1000, speed: 22, reward: 150, r: 18, color: '#ff006e', shape: 'hex',   unlock: 99, armor: 3, leak: 10 },
};

// rocks: [열, 행, 너비, 높이] — 지나갈 수도, 지을 수도 없는 지형
const MAPS = [
  {
    id: 'field', name: '개활지', diff: '쉬움',
    desc: '입구 하나, 넓은 평지. 타워로 미로를 직접 설계하라.',
    spawns: [[0, 7]], core: [23, 7],
    rocks: [[5, 2, 2, 2], [5, 10, 2, 2], [11, 5, 2, 4], [17, 2, 2, 2], [17, 10, 2, 2]],
  },
  {
    id: 'canyon', name: '쌍둥이 협곡', diff: '보통', hp: 1.1, // hp: 맵별 적 체력 배율
    desc: '두 갈래 입구가 중앙 협곡에서 합류한다.',
    spawns: [[0, 2], [0, 11]], core: [23, 7],
    rocks: [[4, 5, 6, 4], [13, 0, 2, 5], [13, 9, 2, 5], [18, 5, 2, 4]],
  },
  {
    id: 'siege', name: '코어 포위', diff: '어려움', hp: 1.35,
    desc: '네 모서리에서 동시에 몰려온다. 중앙을 사수하라.',
    spawns: [[0, 0], [23, 0], [0, 13], [23, 13]], core: [12, 7],
    rocks: [[6, 3, 1, 3], [17, 3, 1, 3], [6, 8, 1, 3], [17, 8, 1, 3], [10, 2, 4, 1], [10, 11, 4, 1]],
  },
];

// 웨이브가 진행될수록 체력이 2차 곡선으로 증가
const hpMult = w => 1 + 0.25 * (w - 1) + 0.02 * (w - 1) * (w - 1);

// 시드 고정 난수 — 같은 웨이브 번호는 항상 같은 구성 (재현 가능한 밸런스)
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 예산 기반 절차적 웨이브 생성: [{type, count, gap, delay}]
function genWave(w) {
  const rnd = mulberry32(w * 7919 + 13);
  const pool = Object.keys(ENEMIES).filter(k => ENEMIES[k].unlock <= w);
  const budget = 40 + w * 22 + w * w * 1.2;
  const n = w < 3 ? 1 : w < 8 ? 2 : 3;
  const picks = [];
  const intro = pool.find(k => ENEMIES[k].unlock === w); // 새로 등장하는 적은 반드시 포함
  if (intro) picks.push(intro);
  while (picks.length < n) {
    const k = pool[Math.floor(rnd() * pool.length)];
    if (!picks.includes(k)) picks.push(k);
  }
  const groups = picks.map((type, i) => ({
    type, gap: ENEMIES[type].gap, delay: i * 3,
    count: Math.max(1, Math.round(budget / n / ENEMIES[type].cost)),
  }));
  if (w % 10 === 0) groups.push({ type: 'boss', count: w / 10, gap: 6, delay: 4 });
  return groups;
}
