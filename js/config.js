// ─────────────────────────────────────────────────────────────
//  config.js — 모든 밸런스 수치와 콘텐츠 정의 (데이터 주도 설계)
//  새 타워·적·맵·변이·스킬은 이 파일에 항목만 추가하면 게임에 반영된다.
// ─────────────────────────────────────────────────────────────
const CELL = 40, COLS = 24, ROWS = 14;
const W = COLS * CELL, H = ROWS * CELL;
const TOTAL_WAVES = 30;
const START_GOLD = 220, START_LIVES = 20, SELL_RATIO = 0.7;
const INTEREST = 0.05, INTEREST_CAP = 40; // 웨이브 클리어 시 보유 골드의 5% 이자 (최대 50)

// levels[0]: 건설, levels[1]: 1차 강화, branches: 3레벨에서 둘 중 하나를 고르는 특화
// sprite.pivot은 이미지 안의 회전축(0~1), muzzle은 회전축부터 포구까지의 거리(px)
const TOWERS = {
  pulse: {
    name: '펄스', key: '1', color: '#4cc9f0',
    desc: '빠른 연사. 지상·공중 모두 공격하는 기본 타워.',
    levels: [
      { cost: 50, dmg: 10, range: 120, rate: 0.50 },
      { cost: 45, dmg: 18, range: 130, rate: 0.45 },
    ],
    branches: [
      { name: '개틀링', desc: '초고속 연사로 단일 화력 최강. 방어력에 약하다.', cost: 110, dmg: 24, range: 140, rate: 0.15 },
      { name: '멀티샷', desc: '한 번에 세 대상을 동시에 사격한다.', cost: 110, dmg: 24, range: 150, rate: 0.42, multi: 3 },
    ],
  },
  mortar: {
    name: '모르타르', key: '2', color: '#ff9f1c', groundOnly: true,
    desc: '범위 폭발 포탄. 뭉친 적에게 강하지만 공중은 못 맞춘다.',
    levels: [
      { cost: 90, dmg: 24, range: 150, rate: 1.60, splash: 44 },
      { cost: 80, dmg: 44, range: 165, rate: 1.50, splash: 50 },
    ],
    branches: [
      { name: '집속탄', desc: '착탄 후 네 발의 자탄이 사방으로 다시 터진다.', cost: 160, dmg: 70, range: 175, rate: 1.40, splash: 52, cluster: 4, cdmg: 62,
        sprite: { src: 'assets/towers/mortar-cluster.png', pivot: [0.46, 0.5], muzzle: 17 } },
      { name: '네이팜', desc: '착탄 지점을 3초간 불태워 방어 무시 지속 피해.', cost: 160, dmg: 60, range: 175, rate: 1.50, splash: 55, burn: 28, burnT: 3,
        sprite: { src: 'assets/towers/mortar-napalm.png', pivot: [0.51, 0.5], muzzle: 15 } },
    ],
  },
  frost: {
    name: '프로스트', key: '3', color: '#90e0ef',
    desc: '주변 모든 적을 감속시키고 지속 피해(방어 무시)를 준다.',
    levels: [
      { cost: 70, dmg: 4, range: 85, slow: 0.30 },
      { cost: 60, dmg: 8, range: 95, slow: 0.40 },
    ],
    branches: [
      { name: '절대영도', desc: '강한 감속. 범위 안의 적은 모든 피해를 25% 더 받는다.', cost: 130, dmg: 14, range: 110, slow: 0.55, vuln: 0.25,
        sprite: { src: 'assets/towers/frost-absolute-zero.png', pivot: [0.5, 0.51] } },
      { name: '빙결', desc: '4초마다 범위 안 모든 적을 1초간 얼린다. (보스 절반)', cost: 130, dmg: 12, range: 105, slow: 0.40, freeze: 1.0, every: 4,
        sprite: { src: 'assets/towers/frost-freeze.png', pivot: [0.48, 0.5] } },
    ],
  },
  tesla: {
    name: '테슬라', key: '4', color: '#c77dff',
    desc: '적에서 적으로 튀는 연쇄 번개. 무리 처리에 탁월.',
    levels: [
      { cost: 120, dmg: 16, range: 110, rate: 0.90, chain: 3 },
      { cost: 100, dmg: 26, range: 120, rate: 0.80, chain: 4 },
    ],
    branches: [
      { name: '폭풍', desc: '열 번까지 튀며 위력이 거의 줄지 않는다.', cost: 200, dmg: 36, range: 135, rate: 0.70, chain: 10, decay: 0.9,
        sprite: { src: 'assets/towers/tesla-storm.png', pivot: [0.49, 0.5] } },
      { name: '과부하', desc: '강한 번개가 맞은 적의 방어력을 영구히 깎는다.', cost: 200, dmg: 80, range: 125, rate: 0.75, chain: 4, decay: 0.85, shred: 2,
        sprite: { src: 'assets/towers/tesla-overload.png', pivot: [0.51, 0.5] } },
    ],
  },
  rail: {
    name: '레일건', key: '5', color: '#f72585', pierce: true,
    desc: '일직선상의 모든 적을 관통. 방어력을 무시하는 초장거리 저격.',
    levels: [
      { cost: 160, dmg: 90, range: 260, rate: 2.60 },
      { cost: 140, dmg: 170, range: 290, rate: 2.40 },
    ],
    branches: [
      { name: '처형자', desc: '맞은 뒤 체력 25% 미만이 된 적은 즉사. (보스 제외)', cost: 300, dmg: 280, range: 330, rate: 2.20, execute: 0.25,
        sprite: { src: 'assets/towers/rail-executioner.png', pivot: [0.34, 0.5], muzzle: 23 } },
      { name: '가우스', desc: '장전 시간을 크게 줄인 연사형 레일건.', cost: 300, dmg: 105, range: 300, rate: 0.95,
        sprite: { src: 'assets/towers/rail-gauss.png', pivot: [0.41, 0.5], muzzle: 17 } },
    ],
  },
};

// cost: 웨이브 예산에서 차지하는 값 / gap: 같은 그룹 내 출현 간격(초)
// shield: 최대 체력 대비 실드 비율 (2초간 피해가 없으면 재생) / split: 죽을 때 스웜 생성 수
const ENEMIES = {
  grunt:    { name: '그런트',   hp: 30,  speed: 50,  reward: 5,  r: 9,  color: '#ff5d73', shape: 'circle',  unlock: 1,  cost: 6,   gap: 0.70 },
  runner:   { name: '러너',     hp: 18,  speed: 100, reward: 5,  r: 7,  color: '#ffd166', shape: 'tri',     unlock: 2,  cost: 6,   gap: 0.45 },
  swarm:    { name: '스웜',     hp: 8,   speed: 72,  reward: 2,  r: 5,  color: '#c8b6ff', shape: 'dot',     unlock: 4,  cost: 2.4, gap: 0.18 },
  tank:     { name: '탱크',     hp: 150, speed: 30,  reward: 15, r: 12, color: '#fb8500', shape: 'square',  unlock: 5,  cost: 20,  gap: 1.50, armor: 4 },
  flyer:    { name: '플라이어', hp: 26,  speed: 62,  reward: 7,  r: 8,  color: '#06d6a0', shape: 'wing',    unlock: 7,  cost: 9,   gap: 0.60, flying: true, icon: 'assets/icons/flyer.png' },
  healer:   { name: '힐러',     hp: 60,  speed: 45,  reward: 12, r: 9,  color: '#80ed99', shape: 'plus',    unlock: 9,  cost: 16,  gap: 1.20, heal: 6, icon: 'assets/icons/healer.png' },
  shield:   { name: '실드',     hp: 45,  speed: 52,  reward: 9,  r: 9,  color: '#48cae4', shape: 'diamond', unlock: 11, cost: 12,  gap: 0.80, shield: 0.8, icon: 'assets/icons/shield.png' },
  splitter: { name: '분열체',   hp: 70,  speed: 40,  reward: 6,  r: 11, color: '#e76f51', shape: 'blob',    unlock: 13, cost: 14,  gap: 1.00, split: 3 },
  boss:     { name: '보스',     hp: 750, speed: 22, reward: 150, r: 18, color: '#ff006e', shape: 'hex',    unlock: 99, armor: 3, leak: 5, icon: 'assets/icons/boss.png' },
};

// rocks: [열, 행, 너비, 높이] — 지나갈 수도, 지을 수도 없는 지형 / hp: 맵별 적 체력 배율
const MAPS = [
  {
    id: 'field', name: '개활지', diff: '쉬움', hp: 1.3,
    desc: '입구 하나, 넓은 평지. 타워로 미로를 직접 설계하라.',
    spawns: [[0, 7]], core: [23, 7],
    rocks: [[5, 2, 2, 2], [5, 10, 2, 2], [11, 5, 2, 4], [17, 2, 2, 2], [17, 10, 2, 2]],
  },
  {
    id: 'canyon', name: '쌍둥이 협곡', diff: '보통', hp: 1.4,
    desc: '두 갈래 입구가 중앙 협곡에서 합류한다.',
    spawns: [[0, 2], [0, 11]], core: [23, 7],
    rocks: [[4, 5, 6, 4], [13, 0, 2, 5], [13, 9, 2, 5], [18, 5, 2, 4]],
  },
  {
    id: 'siege', name: '코어 포위', diff: '어려움', hp: 1.4,
    desc: '네 모서리에서 동시에 몰려온다. 중앙을 사수하라.',
    spawns: [[0, 0], [23, 0], [0, 13], [23, 13]], core: [12, 7],
    rocks: [[6, 3, 1, 3], [17, 3, 1, 3], [6, 8, 1, 3], [17, 8, 1, 3], [10, 2, 4, 1], [10, 11, 4, 1]],
  },
];

// 웨이브 변이: 8웨이브부터 일부 웨이브에 붙어 공략법을 바꾼다
const MODS = {
  armored:  { name: '강철', desc: '모든 적의 방어력 증가', color: '#adb5bd' },
  haste:    { name: '질주', desc: '이동 속도 +30%, 체력 -15%', color: '#ffd166' },
  regen:    { name: '재생', desc: '초당 최대 체력의 2% 회복', color: '#80ed99' },
  horde:    { name: '군단', desc: '적 수 +50%, 체력 -30%', color: '#c8b6ff' },
  shielded: { name: '방벽', desc: '모든 적이 체력 40%만큼의 실드 보유', color: '#48cae4' },
};

// 액티브 스킬: 쿨타임은 전투 중에만 돌아간다
const SKILLS = {
  strike: { name: '궤도 폭격', key: 'q', cd: 40, radius: 75, power: 90, color: '#ff9f1c', icon: 'assets/icons/orbital-strike.png',
            desc: '지정한 위치에 방어 무시 대폭발. 공중 포함. (클릭으로 조준)' },
  stasis: { name: '시간 정지', key: 'e', cd: 75, dur: 3, color: '#90e0ef', icon: 'assets/icons/time-stasis.png',
            desc: '모든 적을 3초간 멈춘다. 보스는 1.5초.' },
};

// 웨이브가 진행될수록 체력이 2차 곡선으로 증가
const hpMult = w => 1 + 0.25 * (w - 1) + 0.03 * (w - 1) * (w - 1);

// 시드 고정 난수 — 같은 웨이브 번호는 항상 같은 구성 (재현 가능한 밸런스)
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 예산 기반 절차적 웨이브 생성 → { groups: [{type, count, gap, delay}], mod }
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

  // 새 적이 처음 나오는 웨이브와 보스 웨이브에는 변이를 붙이지 않는다
  const keys = Object.keys(MODS), roll = rnd();
  const mod = w > TOTAL_WAVES || (w >= 8 && w % 10 !== 0 && !intro && roll < 0.6)
    ? keys[Math.floor(rnd() * keys.length)] : null;

  const mult = mod === 'horde' ? 1.5 : 1;
  const groups = picks.map((type, i) => ({
    type, gap: ENEMIES[type].gap / mult, delay: i * 3,
    count: Math.max(1, Math.round(budget / n / ENEMIES[type].cost * mult)),
  }));
  if (w % 10 === 0) groups.push({ type: 'boss', count: w / 10, gap: 6, delay: 4 });
  return { groups, mod };
}
