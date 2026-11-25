// ─────────────────────────────────────────────────────────────
//  main.js — 게임 루프, 입력, DOM UI (HUD·상점·스킬·메뉴)
// ─────────────────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const cv = $('#cv'), ctx = cv.getContext('2d');
const board = $('#board'), panel = $('#panel'), overlay = $('#overlay'), shop = $('#shop');
const STEP = 1 / 60;

let game = new Game(MAPS[0]); // 메뉴 뒤 배경으로도 쓰인다
let running = false, paused = false, ended = false, speed = 1, scale = 1, acc = 0, last = performance.now(), endTimer = 0;
const ui = { build: null, skill: null, hover: null, mouse: null, valid: false, selected: null, hoverKey: '', paused: false, previewPaths: null, previewDelta: 0 };
const hasActiveRun = () => game.state !== 'won' && game.state !== 'lost' && (game.wave > 0 || game.towers.length > 0);

const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));

// ── 최고 기록 (localStorage) ─────────────────────────────────
const BEST_KEY = 'neon-bastion.best';
const MUTE_KEY = 'neon-bastion.muted';
function loadBest() { try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) { return {}; } }
function saveBest(id, wave) {
  const b = loadBest();
  if (wave > (b[id] || 0)) { b[id] = wave; try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { /* 저장 불가 환경 */ } }
}
function loadMuted() { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; } }
const clearedWaves = () => game.state === 'wave' || game.state === 'lost' ? game.wave - 1 : game.wave;

// ── 화면 크기 대응: 논리 해상도 960×560을 창에 맞게 확대 ──────
function fit() {
  const st = $('#stage'), s = Math.max(0.2, Math.min((st.clientWidth - 20) / W, (st.clientHeight - 20) / H));
  board.style.width = W * s + 'px'; board.style.height = H * s + 'px';
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(W * s * dpr); cv.height = Math.round(H * s * dpr);
  scale = cv.width / W;
}
window.addEventListener('resize', fit);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe($('#stage'));

// ── 상점 (스킬 2 + 타워 8) ───────────────────────────────────
const tip = Object.assign(document.createElement('div'), { id: 'tip' });
function buildShop() {
  shop.innerHTML = '';
  for (const [id, sk] of Object.entries(SKILLS)) {
    const b = document.createElement('button');
    b.className = 'card skill'; b.dataset.skill = id;
    b.style.setProperty('--c', sk.color);
    b.innerHTML = `<img class="glyph" src="${sk.icon}" alt=""><div><div class="nm">${sk.name}</div><div class="cost cd">준비됨</div></div><kbd>${sk.key.toUpperCase()}</kbd><span class="cdbar"></span>`;
    b.onclick = () => triggerSkill(id);
    b.onmouseenter = () => { tip.textContent = `${sk.name} — ${sk.desc} 쿨타임 ${sk.cd}초 (전투 중에만 감소)`; };
    b.onmouseleave = showDefaultTip;
    shop.appendChild(b);
  }
  shop.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
  for (const [type, def] of Object.entries(TOWERS)) {
    const b = document.createElement('button');
    b.className = 'card'; b.dataset.type = type;
    b.innerHTML = `<canvas width="88" height="88"></canvas><div><div class="nm">${def.name}</div><div class="cost">${def.levels[0].cost} G</div></div><kbd>${def.key}</kbd>`;
    const ic = b.querySelector('canvas').getContext('2d');
    ic.scale(2, 2);
    drawTower(ic, type, 0, 22, 22, -Math.PI / 4, 0, 0);
    b.onclick = () => setBuild(ui.build === type ? null : type);
    b.onmouseenter = () => { tip.textContent = `${def.name} — ${def.desc}  3레벨 특화: ${def.branches.map(x => x.name).join(' / ')}`; };
    b.onmouseleave = showDefaultTip;
    shop.appendChild(b);
  }
  shop.appendChild(tip);
  showDefaultTip();
}
function showDefaultTip() {
  tip.textContent = ui.skill === 'strike' ? '궤도 폭격 — 폭격할 위치를 클릭하세요. (우클릭·Esc: 취소)'
    : ui.build ? `${TOWERS[ui.build].name} — ${TOWERS[ui.build].desc}  (우클릭·Esc: 취소)`
    : `타워는 길을 막아 적의 경로를 바꿉니다. 웨이브를 클리어하면 보유 골드의 ${INTEREST * 100}% 이자(최대 ${INTEREST_CAP})가 붙습니다.`;
}

function setBuild(type) {
  ui.build = type; ui.skill = null; ui.selected = null; ui.hoverKey = ''; ui.previewPaths = null; ui.previewDelta = 0;
  shop.querySelectorAll('.card').forEach(c => c.classList.toggle('on', !!type && c.dataset.type === type));
  showDefaultTip();
}

function triggerSkill(id) {
  if (!running || ended || paused || game.cds[id] > 0) return;
  Sfx.init();
  if (id === 'strike') { // 위치 지정이 필요한 스킬은 조준 모드로
    const on = ui.skill !== 'strike';
    setBuild(null);
    ui.skill = on ? 'strike' : null;
    shop.querySelectorAll('.card').forEach(c => c.classList.toggle('on', on && c.dataset.skill === 'strike'));
    showDefaultTip();
  } else game.useSkill(id);
}

// ── 입력 ────────────────────────────────────────────────────
function pointerAt(ev) {
  const r = cv.getBoundingClientRect();
  return [(ev.clientX - r.left) / r.width * W, (ev.clientY - r.top) / r.height * H];
}
function cellAt(ev) {
  const [x, y] = pointerAt(ev), c = Math.floor(x / CELL), r = Math.floor(y / CELL);
  return inb(c, r) ? [c, r] : null;
}
cv.addEventListener('pointermove', ev => { ui.hover = cellAt(ev); ui.mouse = pointerAt(ev); });
cv.addEventListener('pointerleave', () => { ui.hover = null; ui.mouse = null; ui.previewPaths = null; ui.previewDelta = 0; });
cv.addEventListener('contextmenu', ev => ev.preventDefault());
cv.addEventListener('pointerdown', ev => {
  if (!running || ended) return;
  Sfx.init();
  if (ev.button === 2) { setBuild(null); return; }
  if (ui.skill === 'strike') {
    if (paused) return;
    const [x, y] = ui.mouse = pointerAt(ev);
    if (game.useSkill('strike', x, y)) setBuild(null);
    return;
  }
  const cell = ui.hover = cellAt(ev);
  if (!cell) return;
  const [c, r] = cell;
  if (ui.build) {
    if (game.build(ui.build, c, r)) return;
    const t = game.towerAt(c, r); // 건설 모드에서도 기존 타워를 누르면 선택으로 전환
    if (t) { setBuild(null); ui.selected = t; }
    else game.fx.text(cx(c), cx(r), game.gold < TOWERS[ui.build].levels[0].cost ? '골드 부족' : '배치 불가', '#ff5d73');
  } else {
    ui.selected = game.towerAt(c, r) || null;
  }
});

panel.addEventListener('click', ev => {
  if (!running || ended) return;
  const btn = ev.target.closest('button'), t = ui.selected;
  if (!btn || !t) return;
  const act = btn.dataset.act;
  if (act === 'up') game.upgrade(t);
  else if (act === 'br') game.upgrade(t, +btn.dataset.b);
  else if (act === 'sell') { game.sell(t); ui.selected = null; }
  else if (act === 'mode') cycleMode(t);
});
function cycleMode(t) {
  const keys = Object.keys(TARGET_MODES);
  t.mode = keys[(keys.indexOf(t.mode) + 1) % keys.length];
}

// 한글 IME 상태에서도 물리 키(code)로 단축키가 동작하도록 정규화
function hotkey(ev) {
  const k = ev.key.toLowerCase();
  if (/^[a-z0-9 ]$/.test(k) || k === 'escape') return k;
  if (/^Key[A-Z]$/.test(ev.code)) return ev.code[3].toLowerCase();
  if (/^Digit[0-9]$/.test(ev.code)) return ev.code[5];
  if (ev.code === 'Space') return ' ';
  if (ev.code === 'Escape') return 'escape';
  return k;
}

window.addEventListener('keydown', ev => {
  if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (!running && !ended && overlay.classList.contains('show') && hasActiveRun() && hotkey(ev) === 'escape') {
    resumeGame();
    return;
  }
  if (!running || ended) return;
  const k = hotkey(ev), t = ui.selected;
  const type = Object.keys(TOWERS).find(n => TOWERS[n].key === k);
  const skill = Object.keys(SKILLS).find(n => SKILLS[n].key === k);
  if (type) setBuild(ui.build === type ? null : type);
  else if (skill) triggerSkill(skill);
  else if (k === 'escape') setBuild(null);
  else if (k === ' ') { ev.preventDefault(); togglePause(); }
  else if (k === 'f') cycleSpeed();
  else if (k === 'n' && !paused) game.startWave();
  else if (k === 'm') toggleMute();
  else if (k === 'u' && t && t.level === 0) game.upgrade(t);
  else if ((k === 'a' || k === 'b') && t && t.level === 1) game.upgrade(t, k === 'a' ? 0 : 1);
  else if (k === 't' && t && t.type !== 'frost' && !t.def.support) cycleMode(t);
  else if (k === 'x' && t) { game.sell(t); ui.selected = null; }
});

$('#btnWave').onclick = () => { if (!running || ended || paused) return; Sfx.init(); game.startWave(); };
$('#btnSpeed').onclick = cycleSpeed;
$('#btnPause').onclick = togglePause;
$('#btnMute').onclick = toggleMute;
$('#btnMenu').onclick = () => { saveBest(game.daily ? 'daily:' + game.seed : game.map.id, clearedWaves()); showMenu(); };

function cycleSpeed() { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; $('#btnSpeed').textContent = `×${speed}`; }
function togglePause() {
  if (!running || ended) return;
  paused = !paused;
  if (paused && ui.skill) setBuild(null);
  $('#btnPause').textContent = paused ? '계속하기' : '일시정지';
}
function toggleMute() {
  Sfx.muted = !Sfx.muted;
  $('#btnMute').textContent = Sfx.muted ? '소리 끔' : '소리 켬';
  try { localStorage.setItem(MUTE_KEY, Sfx.muted ? '1' : '0'); } catch (e) { /* 저장 불가 환경 */ }
}
if (loadMuted()) { Sfx.muted = true; $('#btnMute').textContent = '소리 끔'; }
document.addEventListener('visibilitychange', () => {
  if (document.hidden && running && !ended && !paused) togglePause();
});

// ── 상성 툴팁: 미리보기의 적에 마우스를 올리면 약점 안내 ─────
const entip = Object.assign(document.createElement('div'), { id: 'entip' });
document.body.appendChild(entip);
function moveEntip(ev) {
  const r = entip.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY + 18;
  if (x + r.width + 8 > innerWidth) x = ev.clientX - r.width - 10;
  if (y + r.height + 8 > innerHeight) y = ev.clientY - r.height - 12;
  entip.style.left = x + 'px'; entip.style.top = y + 'px';
}
$('#preview').addEventListener('mouseover', ev => {
  const en = ev.target.closest('.en'), def = en && ENEMIES[en.dataset.type];
  if (!def || !def.tip) return;
  entip.dataset.type = en.dataset.type;
  entip.innerHTML = `<b style="color:${def.color}">${def.name}</b> — ${def.tip}`;
  entip.classList.add('show');
  moveEntip(ev);
});
$('#preview').addEventListener('mousemove', ev => { if (entip.classList.contains('show')) moveEntip(ev); });
$('#preview').addEventListener('mouseout', ev => {
  if (!ev.relatedTarget || !ev.relatedTarget.closest?.('.en')) entip.classList.remove('show');
});
$('#preview').addEventListener('click', ev => {
  const en = ev.target.closest('.en'), def = en && ENEMIES[en.dataset.type];
  if (!def || !def.tip) return;
  if (entip.classList.contains('show') && entip.dataset.type === en.dataset.type) entip.classList.remove('show');
  else {
    entip.dataset.type = en.dataset.type;
    entip.innerHTML = `<b style="color:${def.color}">${def.name}</b> — ${def.tip}`;
    entip.classList.add('show');
    moveEntip(ev);
  }
});
document.addEventListener('click', ev => {
  if (entip.classList.contains('show') && !ev.target.closest?.('#preview')) entip.classList.remove('show');
});

// ── HUD 동기화: 값이 바뀐 요소만 DOM 갱신 ─────────────────────
const cache = {};
function set(id, value, prop = 'textContent') {
  if (cache[id + prop] === value) return false;
  cache[id + prop] = value; $(id)[prop] = value;
  return true;
}

function syncUI() {
  set('#lives', String(Math.max(0, game.lives)));
  set('#gold', String(game.gold));
  set('#wave', game.endless ? `${game.wave}` : `${game.wave} / ${TOTAL_WAVES}`);

  const inWave = game.state === 'wave';
  set('#dailyTag', !game.daily, 'hidden');
  set('#btnWave', !running || inWave || ended || paused, 'disabled');
  set('#btnWave', inWave ? '전투 중…' : game.countdown > 0
    ? `지금 호출 (${Math.ceil(game.countdown)}초 · +${Math.ceil(game.countdown) * 2}G) <kbd>N</kbd>` : '웨이브 시작 <kbd>N</kbd>', 'innerHTML');

  // 다음(또는 현재) 웨이브 구성과 변이 미리보기
  // 미리보기가 갱신되면 hover 중이던 적 표식이 통째로 교체되므로 툴팁을 닫는다
  const wv = genWave(inWave ? game.wave : game.wave + 1, game.seed), mod = wv.mod && MODS[wv.mod];
  if (set('#preview', (inWave ? '현재' : '다음') +
    (mod ? ` <span class="mod" style="--c:${mod.color}" title="${mod.desc}">${mod.name} · ${mod.desc}</span>` : '') +
    wv.groups.map(({ type, count }) => {
      const { name, color, icon } = ENEMIES[type];
      const marker = enemyIcons[type]?.naturalWidth ? `<img src="${icon}" alt="">` : `<i class="dot" style="background:${color}"></i>`;
      return `<span class="en" data-type="${type}">${marker}${name}×${count}</span>`;
    }).join(''), 'innerHTML')) entip.classList.remove('show');

  for (const c of shop.querySelectorAll('.card')) {
    if (c.dataset.type) { c.classList.toggle('poor', game.gold < TOWERS[c.dataset.type].levels[0].cost); continue; }
    const id = c.dataset.skill, left = game.cds[id], label = left > 0 ? `${Math.ceil(left)}초` : '준비됨';
    if (c._label !== label) { c._label = label; c.querySelector('.cd').textContent = label; c.classList.toggle('cooling', left > 0); }
    c.style.setProperty('--p', left / SKILLS[id].cd);
  }

  // 배치 가능 여부와 우회 경로는 커서 칸이나 지형이 바뀔 때만 재계산 (BFS 비용 절약)
  if (ui.build && ui.hover) {
    const key = ui.hover.join() + ':' + game.version + ':' + (game.enemies.length ? Math.floor(game.time * 4) : 0);
    if (key !== ui.hoverKey) {
      ui.hoverKey = key;
      const prev = game.previewPaths(ui.hover[0], ui.hover[1]);
      ui.valid = prev.valid; ui.previewPaths = prev.paths; ui.previewDelta = prev.delta;
    }
  }

  syncPanel();
}

let panelHtml = '';
function syncPanel() {
  const t = ui.selected;
  if (!t || !game.towers.includes(t)) { ui.selected = null; set('#panel', true, 'hidden'); return; }
  const s = game.stats(t), n = t.level === 0 ? t.def.levels[1] : null;
  const row = (label, cur, nxt, unit = '') =>
    `<tr><td>${label}</td><td>${cur}${unit}${nxt != null && nxt !== cur ? ` <span class="up">→ ${nxt}${unit}</span>` : ''}</td></tr>`;
  const pct = v => v && Math.round(v * 100);
  const rows = [];
  if (t.def.support) {
    rows.push(row('피해 증폭', pct(s.buff), n && pct(n.buff), '%'), row('범위', s.range, n?.range));
    if (s.haste) rows.push(row('연사 증폭', pct(s.haste), null, '%'));
    rows.push('<tr><td>강화 중</td><td class="dealt"></td></tr>');
  } else {
    rows.push(row(t.type === 'frost' ? '초당 피해' : '피해', s.dmg, n?.dmg), row('사거리', s.range, n?.range));
    if (s.rate) rows.push(row('공격 간격', s.rate.toFixed(2), n?.rate.toFixed(2), '초'));
    if (s.ramp) rows.push(row('최대 배율', '×' + s.ramp, n && '×' + n.ramp));
    if (s.splash) rows.push(row('폭발 반경', s.splash, n?.splash));
    if (s.air) rows.push(row('공중 피해', '×' + s.air, n && '×' + n.air));
    if (s.slow) rows.push(row('감속', pct(s.slow), n && pct(n.slow), '%'));
    if (s.chain) rows.push(row('연쇄', s.chain, n?.chain, '회'));
    if (s.multi) rows.push(row('동시 타격', s.multi, n?.multi, '대상'));
    if (s.cdmg) rows.push(row('자탄 피해', s.cdmg, null));
    if (s.burn) rows.push(row('초당 화상', s.burn, null));
    if (s.freeze) rows.push(row('빙결', `${s.freeze}초 / ${s.every}초`, null));
    if (s.shred) rows.push(row('방어 감소', '-' + s.shred, null));
    if (s.execute) rows.push(row('즉사 기준', `체력 ${pct(s.execute)}% 미만`, null));
    if (s.emp) rows.push(row('실드 차단', s.emp, null, '초'));
    if (t.buff) rows.push(row('증폭 받음', `+${pct(t.buff)}%` + (t.haste && s.rate ? ` · 연사 +${pct(t.haste)}%` : ''), null));
    rows.push('<tr><td>누적 피해</td><td class="dealt"></td></tr>');
  }

  const title = t.branch != null ? t.def.branches[t.branch].name : t.def.name;
  let html = `<h3 style="color:${t.def.color}">${title}<small>Lv.${t.level + 1}</small></h3>` +
    (t.branch != null ? `<p class="spec">${t.def.branches[t.branch].desc}</p>` : '') + `<table>${rows.join('')}</table>`;
  if (t.type !== 'frost' && !t.def.support) html += `<div class="row"><button data-act="mode">조준: ${TARGET_MODES[t.mode]} <kbd>T</kbd></button></div>`;
  if (t.level === 1) { // 특화 분기 선택
    html += '<div class="branches">' + t.def.branches.map((b, i) =>
      `<button data-act="br" data-b="${i}" ${game.gold < b.cost ? 'disabled' : ''}>
        <span class="bt"><b>${b.name}</b><span class="c">${b.cost}G <kbd>${'AB'[i]}</kbd></span></span><small>${b.desc}</small></button>`).join('') + '</div>';
  } else if (t.level === 0) {
    const cost = game.upgradeCost(t);
    html += `<div class="row"><button data-act="up" class="primary" ${game.gold < cost ? 'disabled' : ''}>강화 ${cost}G <kbd>U</kbd></button></div>`;
  }
  html += `<div class="row"><button data-act="sell" class="danger">판매 +${Math.floor(t.spent * (SELL_RATIO * 100) / 100)}G <kbd>X</kbd></button></div>`;

  if (html !== panelHtml) { panelHtml = html; panel.innerHTML = html; }
  const d = panel.querySelector('.dealt'), v = t.def.support ? `타워 ${t.links.length}기` : fmt(t.dealt);
  if (d.textContent !== v) d.textContent = v; // 매 프레임 바뀌는 값은 패널을 다시 만들지 않고 이 칸만 갱신
  set('#panel', false, 'hidden');
  // 타워를 가리지 않도록 반대편에 배치
  panel.style.left = t.x > W / 2 ? '10px' : ''; panel.style.right = t.x > W / 2 ? '' : '10px';
}

// ── 메뉴·결과 화면 ──────────────────────────────────────────
function resumeGame() {
  if (!hasActiveRun()) return;
  Sfx.init();
  running = true; paused = false; acc = 0; last = performance.now();
  $('#btnPause').textContent = '일시정지';
  overlay.classList.remove('show');
}

function showMenu() {
  clearTimeout(endTimer); endTimer = 0; entip.classList.remove('show');
  running = false; ended = false; paused = false; setBuild(null);
  const best = loadBest();
  const dseed = dailySeed(), dmap = MAPS[dailyMapIndex(dseed)], dkey = 'daily:' + dseed;
  const active = hasActiveRun();
  const mapBadge = b => b >= TOTAL_WAVES ? `★ 클리어 · 최고 웨이브 ${b}` : b ? `최고 기록: 웨이브 ${b}` : '기록 없음';
  const dailyBadge = b => b >= TOTAL_WAVES ? `★ 오늘 클리어 · 웨이브 ${b}` : b ? `오늘의 기록: 웨이브 ${b}` : '오늘 첫 도전';
  overlay.innerHTML = `<div class="modal">
    <h1>NEON<b>BASTION</b></h1>
    <p>타워로 미로를 설계해 ${TOTAL_WAVES}번의 웨이브로부터 코어를 지켜라</p>
    ${active ? `<div class="resume-bar"><button class="primary resume" data-resume="1">진행 중인 게임 계속하기 · ${game.daily ? '일일 챌린지' : game.map.name} (웨이브 ${game.wave} · 내구도 ${Math.max(0, game.lives)})</button></div>` : ''}
    <div class="maps">${MAPS.map((m, i) => `
      <button class="map" data-map="${i}">
        <canvas width="480" height="280"></canvas>
        <div class="t">${m.name}<em>${m.diff}</em></div>
        <div class="d">${m.desc}</div>
        <div class="b">${mapBadge(best[m.id])}</div>
      </button>`).join('')}
      <button class="map daily" data-daily="1">
        <canvas width="480" height="280"></canvas>
        <div class="t">일일 챌린지<em>${dailyLabel(dseed)}</em></div>
        <div class="d">오늘의 맵: ${dmap.name} — 같은 날엔 누구나 같은 구성으로 플레이합니다.</div>
        <div class="b">${dailyBadge(best[dkey])}</div>
      </button></div>
    <div class="help">
      <kbd>1</kbd>–<kbd>${Object.keys(TOWERS).length}</kbd> 타워 선택 · 클릭으로 배치 · <kbd>U</kbd> 강화 · <kbd>A</kbd>/<kbd>B</kbd> 3레벨 특화 · <kbd>X</kbd> 판매 · <kbd>T</kbd> 조준 변경<br>
      <kbd>Q</kbd> 궤도 폭격 · <kbd>E</kbd> 시간 정지 · <kbd>N</kbd> 웨이브 호출 · <kbd>F</kbd> 배속 · <kbd>Space</kbd> 일시정지 · <kbd>M</kbd> 소리
    </div></div>`;
  const rbtn = overlay.querySelector('[data-resume]');
  if (rbtn) rbtn.onclick = resumeGame;
  overlay.querySelectorAll('.map[data-map]').forEach(b => {
    const m = MAPS[b.dataset.map];
    drawThumb(b.querySelector('canvas').getContext('2d'), m);
    b.onclick = () => startGame(m);
  });
  const dbtn = overlay.querySelector('.map[data-daily]');
  drawThumb(dbtn.querySelector('canvas').getContext('2d'), dmap);
  dbtn.onclick = () => startGame(dmap, dseed, true);
  overlay.classList.add('show');
}

function drawThumb(c, m) {
  render(c, new Game(m), {}, 0.5);
}

function startGame(map, seed = 0, daily = false) {
  clearTimeout(endTimer); endTimer = 0; entip.classList.remove('show');
  Sfx.init();
  game = new Game(map, seed);
  game.daily = !!daily;
  running = true; ended = false; paused = false; acc = 0;
  ui.selected = null; setBuild(null);
  $('#btnPause').textContent = '일시정지';
  overlay.classList.remove('show');
}

function shareSummary() {
  const mode = game.daily ? `일일 챌린지 ${dailyLabel(game.seed)} · ${game.map.name}` : game.map.name;
  const result = game.state === 'won' ? `방어 성공 (${TOTAL_WAVES}W)` : `웨이브 ${game.wave} 도달 (클리어 ${clearedWaves()}W)`;
  const mvp = [...game.towers].sort((a, b) => b.dealt - a.dealt)[0];
  const mvpName = mvp && (mvp.branch != null ? mvp.def.branches[mvp.branch].name : mvp.def.name);
  return [
    `NEON BASTION — ${mode}`,
    `${result} · 내구도 ${Math.max(0, game.lives)} · 처치 ${game.kills}` + (mvp ? ` · MVP ${mvpName}(${fmt(mvp.dealt)})` : ''),
    'https://esin3329.github.io/neon-bastion/',
  ].join('\n');
}

function showEnd() {
  entip.classList.remove('show');
  const won = game.state === 'won';
  saveBest(game.daily ? 'daily:' + game.seed : game.map.id, clearedWaves());
  const mvp = [...game.towers].sort((a, b) => b.dealt - a.dealt)[0];
  const mvpName = mvp && (mvp.branch != null ? mvp.def.branches[mvp.branch].name : mvp.def.name);
  overlay.innerHTML = `<div class="modal">
    <h2 class="${won ? 'win' : 'lose'}">${won ? '방어 성공' : '코어 파괴됨'}</h2>
    <p>${game.daily ? `일일 챌린지 · ${dailyLabel(game.seed)} · ${game.map.name}` : game.map.name} · ${won ? `${TOTAL_WAVES}개 웨이브를 모두 막아냈습니다` : `웨이브 ${game.wave}에서 무너졌습니다`}</p>
    <div class="results">
      <div><b>${clearedWaves()}</b><span>클리어한 웨이브</span></div>
      <div><b>${game.kills}</b><span>처치</span></div>
      <div><b>${Math.max(0, game.lives)}</b><span>남은 내구도</span></div>
      ${mvp ? `<div><b style="color:${mvp.def.color}">${mvpName}</b><span>MVP · 피해 ${fmt(mvp.dealt)}</span></div>` : ''}
    </div>
    <div class="actions">
      ${won ? '<button class="primary" data-act="endless">무한 모드로 계속</button>' : ''}
      <button class="${won ? '' : 'primary'}" data-act="retry">다시 도전</button>
      <button data-act="share">결과 복사</button>
      <button data-act="menu">맵 선택</button>
    </div></div>`;
  overlay.querySelector('.actions').onclick = ev => {
    const btn = ev.target.closest('button'), act = btn?.dataset.act;
    if (act === 'retry') startGame(game.map, game.seed, game.daily);
    else if (act === 'menu') showMenu();
    else if (act === 'share') {
      const done = label => { btn.textContent = label; setTimeout(() => { btn.textContent = '결과 복사'; }, 1500); };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(shareSummary()).then(() => done('복사됨!'), () => done('복사 불가'));
      else done('복사 불가');
    } else if (act === 'endless') {
      game.endless = true; game.state = 'build'; game.countdown = 10;
      ended = false; overlay.classList.remove('show');
    }
  };
  overlay.classList.add('show');
}

// ── 게임 루프: 누적 시간을 고정 스텝으로 소비 ─────────────────
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running && !paused) {
    acc += real * speed;
    for (let n = 0; acc >= STEP && n < 16; n++) { game.update(STEP); acc -= STEP; }
    if (acc > STEP * 16) acc = 0; // 탭 복귀 등으로 밀린 시간은 버린다
    if (!ended && (game.state === 'won' || game.state === 'lost')) {
      ended = true; setBuild(null);
      const finished = game;
      endTimer = setTimeout(() => { endTimer = 0; if (running && game === finished) showEnd(); }, 1100);
    }
  }
  ui.paused = paused;
  render(ctx, game, ui, scale);
  syncUI();
  requestAnimationFrame(frame);
}

function redrawMenuThumbs() {
  const dmap = MAPS[dailyMapIndex(dailySeed())];
  overlay.querySelectorAll('.map').forEach(button => {
    const map = button.dataset.daily ? dmap : MAPS[button.dataset.map];
    if (map) drawThumb(button.querySelector('canvas').getContext('2d'), map);
  });
}

buildShop();
fit();
showMenu();
Promise.allSettled(Object.values(sceneSprites).map(image => image.decode())).then(redrawMenuThumbs);
requestAnimationFrame(frame);
