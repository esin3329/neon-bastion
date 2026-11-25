// node tools/check-ui.js — main.js DOM·타이머·일시정지·단축키·IME·리사이즈 회귀 검증.
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const source = ['config', 'effects', 'game', 'render', 'main']
  .map(name => fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8')).join('\n');

function makeCtx() {
  const transforms = [], draws = [];
  const ctx = new Proxy({
    transforms, draws,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    save() {}, restore() {},
    createRadialGradient() { return { addColorStop() {} }; },
    setTransform(...args) { transforms.push(args); },
    drawImage(image, ...args) { draws.push({ src: image?.src || '', args }); },
  }, {
    get: (o, k) => k in o ? o[k] : () => {},
    set: (o, k, v) => { if (typeof v !== 'function') o[k] = v; return true; },
  });
  return ctx;
}

function makeClassList(initial = '') {
  const set = new Set(initial.split(/\s+/).filter(Boolean));
  return {
    add: (...cls) => cls.forEach(c => set.add(c)),
    remove: (...cls) => cls.forEach(c => set.delete(c)),
    toggle: (c, force) => force === undefined ? (set.has(c) ? (set.delete(c), false) : (set.add(c), true)) : (force ? (set.add(c), true) : (set.delete(c), false)),
    contains: c => set.has(c),
    get value() { return [...set].join(' '); },
  };
}

function makeEl(id = '', cls = '') {
  const listeners = {}, children = [], styleProps = {};
  const classList = makeClassList(cls);
  let html = '';
  let mapButtons = [], resumeBtn = null, actionsEl = null, dealtEl = null, cdEl = null, canvasEl = null;

  const el = {
    id, children, listeners, dataset: {},
    style: Object.assign(styleProps, { setProperty(k, v) { styleProps[k] = v; } }),
    classList,
    textContent: '', hidden: false, disabled: false,
    clientWidth: 1200, clientHeight: 800, width: 960, height: 560,
    getContext: () => id === 'cv' ? mainCtx : makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 560 }),
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatch(type, ev) { for (const fn of listeners[type] || []) fn(ev); },
    appendChild(child) { children.push(child); return child; },
    set className(v) { classList.remove(...classList.value.split(/\s+/).filter(Boolean)); classList.add(...String(v).split(/\s+/).filter(Boolean)); },
    get className() { return classList.value; },
    set innerHTML(v) {
      html = String(v);
      if (id === 'overlay') {
        mapButtons = []; resumeBtn = null;
        for (const m of html.matchAll(/<button\s+class="([^"]*)"([^>]*)>/g)) {
          const btn = makeEl('', m[1]);
          const dm = m[2].match(/data-map="([^"]*)"/), dd = m[2].match(/data-daily="([^"]*)"/), dr = m[2].match(/data-resume="([^"]*)"/);
          if (dm) btn.dataset.map = dm[1];
          if (dd) btn.dataset.daily = dd[1];
          if (dr) { btn.dataset.resume = dr[1]; resumeBtn = btn; }
          if (m[1].split(/\s+/).includes('map')) {
            btn._canvas = makeEl();
            btn._ctx = makeCtx();
            btn._canvas.getContext = () => btn._ctx;
            mapButtons.push(btn);
          }
        }
        actionsEl = html.includes('class="actions"') ? makeEl() : null;
      } else {
        canvasEl = html.includes('<canvas') ? makeEl() : null;
        cdEl = html.includes('class="cost cd"') ? makeEl() : null;
        dealtEl = html.includes('class="dealt"') ? makeEl() : null;
      }
    },
    get innerHTML() { return html; },
    querySelector(sel) {
      if (sel === 'canvas') return el._canvas || canvasEl || makeEl();
      if (sel === '.cd') return cdEl || makeEl();
      if (sel === '.dealt') return dealtEl || makeEl();
      if (sel === '.actions') return actionsEl;
      if (sel === '[data-resume]') return resumeBtn;
      if (sel === '.map[data-daily]') return mapButtons.find(b => 'daily' in b.dataset) || null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.card') return children.filter(c => c.classList.contains('card'));
      if (sel === '.map') return mapButtons;
      if (sel === '.map[data-map]') return mapButtons.filter(b => 'map' in b.dataset);
      return [];
    },
  };
  return el;
}

const mainCtx = makeCtx();
const elements = new Map();
for (const id of ['cv', 'board', 'panel', 'overlay', 'shop', 'stage', 'btnWave', 'btnSpeed', 'btnPause', 'btnMute', 'btnMenu', 'lives', 'gold', 'wave', 'dailyTag', 'preview']) {
  elements.set('#' + id, makeEl(id));
}
const body = makeEl('body');
const windowListeners = {}, docListeners = {}, timers = new Map(), rafs = [], resizeObservers = [], decodes = [];
let nextTimerId = 1, nowMs = 1000, unhandled = null, docHidden = false, copiedText = '';
process.on('unhandledRejection', err => { unhandled = err; });

class MockImage {
  constructor() { this.naturalWidth = 0; }
  decode() {
    return new Promise(resolve => decodes.push(() => { this.naturalWidth = 128; resolve(); }));
  }
}
class MockResizeObserver {
  constructor(cb) { this.cb = cb; this.targets = []; resizeObservers.push(this); }
  observe(target) { this.targets.push(target); }
}
class MockAudioContext {
  constructor() { this.state = 'suspended'; this.resumeCount = 0; this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
  resume() { this.resumeCount++; this.state = 'running'; return Promise.resolve(); }
  createOscillator() { return { type: 'square', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; }, start() {}, stop() {} }; }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; } }; }
  createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return { buffer: null, connect() { return this; }, start() {} }; }
  createBiquadFilter() { return { type: 'lowpass', frequency: { value: 900 }, connect() { return this; } }; }
}

const sandbox = {
  Math, Promise, Set, Map, JSON, String, Number, BigInt, Object, Array, RegExp, Date, console,
  performance: { now: () => nowMs },
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  Image: MockImage,
  ResizeObserver: MockResizeObserver,
  localStorage: { getItem: () => null, setItem() {} },
  document: {
    body,
    get hidden() { return docHidden; },
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    querySelector: sel => elements.get(sel) || null,
    createElement: () => makeEl(),
  },
  navigator: {
    clipboard: { writeText: text => { copiedText = text; return Promise.resolve(); } },
  },
  window: {
    devicePixelRatio: 1,
    AudioContext: MockAudioContext,
    addEventListener(type, fn) { (windowListeners[type] ||= []).push(fn); },
  },
  setTimeout(fn, ms) {
    const id = nextTimerId++;
    timers.set(id, { fn, ms, cleared: false });
    return id;
  },
  clearTimeout(id) {
    if (timers.has(id)) timers.get(id).cleared = true;
  },
  requestAnimationFrame(fn) { rafs.push(fn); return rafs.length; },
};
sandbox.addEventListener = sandbox.window.addEventListener;

vm.createContext(sandbox);
vm.runInContext(source + '\n;globalThis.__ui = { Game, MAPS, get game(){ return game; }, get running(){ return running; }, get paused(){ return paused; }, get ended(){ return ended; }, get speed(){ return speed; }, ui, entip, showMenu, showEnd, startGame, resumeGame, hasActiveRun, shareSummary, triggerSkill, frame, Sfx };', sandbox);
const api = sandbox.__ui;

(async () => {
  // 1. 초기 sceneSprites.decode() 완료 후 일일 챌린지 포함 4개 맵 썸네일이 오류 없이 다시 그려져야 한다.
  const mapButtons = elements.get('#overlay').querySelectorAll('.map');
  assert.equal(mapButtons.length, 4, '메뉴에 일반 맵 3개 + 일일 챌린지 1개가 있다');
  assert.ok('daily' in mapButtons[3].dataset && !('map' in mapButtons[3].dataset), '일일 챌린지 카드는 data-daily만 가진다');
  for (const btn of mapButtons) btn._ctx.draws.length = 0;
  while (decodes.length) decodes.shift()();
  await new Promise(r => setImmediate(r));
  assert.equal(unhandled, null, 'decode() 이후 미처리 거부 오류가 없어야 한다');
  for (const btn of mapButtons) assert.ok(btn._ctx.draws.length > 0, '일일 챌린지를 포함한 모든 맵 썸네일이 다시 그려진다');

  // 2. ResizeObserver가 #stage를 감시하며 크기 변화 시 fit()으로 보드 크기를 갱신해야 한다.
  assert.equal(resizeObservers.length, 1);
  assert.ok(resizeObservers[0].targets.includes(elements.get('#stage')));
  const prevBoardW = elements.get('#board').style.width;
  elements.get('#stage').clientWidth = 640; elements.get('#stage').clientHeight = 360;
  resizeObservers[0].cb();
  assert.notEqual(elements.get('#board').style.width, prevBoardW, '스테이지 크기 변화 시 보드 너비가 재계산된다');

  // 3. 승패 후 1.1초 타이머가 끝나기 전에 메뉴로 나가면 showEnd()가 메뉴를 덮어쓰지 않아야 한다.
  api.startGame(api.MAPS[0]);
  assert.ok(api.Sfx.ac && api.Sfx.ac.resumeCount >= 1 && api.Sfx.ac.state === 'running', 'suspended AudioContext는 사용자 입력으로 재개된다');
  const t0 = api.game.build('pulse', 5, 7);
  api.ui.selected = t0;
  api.game.state = 'lost';
  nowMs += 16;
  api.frame(nowMs);
  assert.equal(api.ended, true);
  // ended 상태에서 패널 판매 버튼 클릭은 무시되어야 한다
  elements.get('#panel').dispatch('click', { target: { closest: sel => sel === 'button' ? { dataset: { act: 'sell' } } : null } });
  assert.ok(api.game.towers.includes(t0), '게임 종료 대기 중에는 패널 조작으로 타워를 팔 수 없다');
  // 1.1초 전 메뉴 클릭 -> 타이머 취소 + #entip 닫힘
  api.entip.classList.add('show');
  elements.get('#btnMenu').onclick();
  assert.equal(api.entip.classList.contains('show'), false, '메뉴 복귀 시 상성 툴팁이 닫힌다');
  for (const t of timers.values()) if (!t.cleared) t.fn();
  assert.equal(api.running, false);
  assert.equal(elements.get('#overlay').querySelectorAll('.map').length, 4, '지연된 showEnd가 메뉴를 덮어쓰지 않는다');

  // showEnd() 진입 시에도 #entip 닫힘 확인
  api.startGame(api.MAPS[0]);
  api.entip.classList.add('show');
  api.showEnd();
  assert.equal(api.entip.classList.contains('show'), false, '결과 화면 진입 시 상성 툴팁이 닫힌다');

  // 4. 일시정지 중 스킬 차단, 흔들림 억제, 죽은 적 미렌더, 증폭기 즉시 반영 검증
  api.startGame(api.MAPS[0]);
  api.game.gold = 9999;
  const pulse = api.game.build('pulse', 8, 7);
  const amp = api.game.build('amp', 9, 7);
  assert.ok(pulse.buff > 0, 'update() 없이도 건설 즉시 증폭기 버프가 반영된다');
  api.game.sell(amp);
  assert.equal(pulse.buff, 0, 'update() 없이도 판매 즉시 증폭기 버프가 해제된다');

  const keydown = ev => {
    const full = Object.assign({ repeat: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} }, ev);
    for (const fn of windowListeners.keydown || []) fn(full);
  };
  keydown({ key: ' ', code: 'Space' }); // 일시정지 ON
  assert.equal(api.paused, true);
  api.triggerSkill('stasis');
  assert.equal(api.game.cds.stasis, 0, '일시정지 중에는 시간 정지가 발동하지 않는다');
  api.triggerSkill('strike');
  assert.equal(api.ui.skill, null, '일시정지 중에는 궤도 폭격 조준도 켜지지 않는다');

  api.game.fx.shake = 12;
  api.game.spawn('grunt', 0);
  api.game.enemies[0].alive = false;
  mainCtx.transforms.length = 0;
  mainCtx.draws.length = 0;
  nowMs += 16;
  api.frame(nowMs);
  const [sx, , , sy, tx, ty] = mainCtx.transforms[mainCtx.transforms.length - 1];
  assert.ok(tx === 0 && ty === 0);
  assert.ok(sx > 0 && sy > 0);
  assert.ok(!mainCtx.draws.some(d => d.src.includes('icons')), '죽은 적은 일시정지 프레임에 그려지지 않는다');

  // 일시정지 해제 후 단축키 수정자 가드 & 한글 IME 물리 키(code) 매핑 검증
  keydown({ key: ' ', code: 'Space' });
  assert.equal(api.paused, false);
  api.ui.selected = pulse;
  const prevSpeed = api.speed;
  keydown({ key: 'x', code: 'KeyX', ctrlKey: true });
  keydown({ key: 'f', code: 'KeyF', ctrlKey: true });
  keydown({ key: 'n', code: 'KeyN', ctrlKey: true });
  keydown({ key: 't', code: 'KeyT', metaKey: true });
  assert.ok(api.game.towers.includes(pulse), 'Ctrl+X는 타워를 팔지 않는다');
  assert.equal(api.speed, prevSpeed, 'Ctrl+F는 배속을 바꾸지 않는다');
  assert.equal(api.game.wave, 0, 'Ctrl+N은 웨이브를 시작하지 않는다');
  assert.equal(pulse.mode, 'first', 'Meta+T는 조준 모드를 바꾸지 않는다');

  // 한글 IME 입력 simulation
  keydown({ key: 'ㅂ', code: 'KeyQ' });
  assert.equal(api.ui.skill, 'strike', '한글 IME에서 Q(ㅂ)로 궤도 폭격 조준이 켜진다');
  keydown({ key: 'Escape', code: 'Escape' });
  assert.equal(api.ui.skill, null, 'Esc로 조준이 취소된다');
  api.ui.selected = pulse;
  keydown({ key: 'ㅌ', code: 'KeyX' });
  assert.ok(!api.game.towers.includes(pulse), '한글 IME에서 X(ㅌ)로 타워가 판매된다');
  keydown({ key: 'ㅜ', code: 'KeyN' });
  assert.equal(api.game.wave, 1, '한글 IME에서 N(ㅜ)으로 웨이브가 시작된다');
  assert.ok(api.game.fx.banner && api.game.fx.banner.title === 'WAVE 1', '웨이브 1 시작 시 배너가 생성된다');

  // 5. 미로 경로 미리보기(+N칸), 배너/증폭기 미리보기 렌더, Lv.3 특화 패널 스탯 검증
  const prevExtend = new api.Game(api.MAPS[0]).previewPaths(11, 9);
  assert.equal(prevExtend.valid, true);
  assert.equal(prevExtend.delta, 2, '중앙 바위 아래(11,9)를 막으면 최단 경로가 2칸 늘어난다');
  const prevBlockCore = api.game.previewPaths(api.game.core[0], api.game.core[1]);
  assert.equal(prevBlockCore.valid, false, '코어 칸은 배치 불가다');
  const prevSeal = (() => {
    const g = new api.Game(api.MAPS[0]); g.gold = 9999;
    g.build('pulse', 1, 7); g.build('pulse', 0, 6);
    return g.previewPaths(0, 8);
  })();
  assert.equal(prevSeal.valid, false, '입구를 완전히 봉쇄하면 valid=false를 반환한다');

  api.game.gold = 9999;
  const emp = api.game.build('missile', 5, 7);
  api.game.upgrade(emp); api.game.upgrade(emp, 1); // EMP
  api.game.build('amp', 6, 7);
  api.ui.build = 'pulse'; api.ui.hover = [6, 8]; api.ui.hoverKey = '';
  api.ui.selected = emp;
  nowMs += 16;
  api.frame(nowMs);
  assert.ok(elements.get('#panel').innerHTML.includes('실드 차단'), 'Lv.3 EMP 특화의 실드 차단 스탯이 패널에 표시된다');

  // 6. 메뉴 복귀 후 계속하기(버튼 및 Esc), 탭 숨김 자동 일시정지, 결과 공유 클립보드 검증
  assert.equal(api.hasActiveRun(), true);
  const activeGame = api.game;
  elements.get('#btnMenu').onclick();
  assert.equal(api.running, false);
  const rbtn = elements.get('#overlay').querySelector('[data-resume]');
  assert.ok(rbtn, '진행 중 메뉴를 열면 계속하기 버튼이 표시된다');
  rbtn.onclick();
  assert.equal(api.running, true);
  assert.equal(api.game, activeGame, '계속하기로 기존 게임 인스턴스가 복원된다');

  elements.get('#btnMenu').onclick();
  keydown({ key: 'Escape', code: 'Escape' });
  assert.equal(api.running, true, '메뉴에서 Esc를 누르면 진행 중인 게임으로 돌아간다');

  docHidden = true;
  for (const fn of docListeners.visibilitychange || []) fn();
  assert.equal(api.paused, true, '탭이 숨겨지면 자동으로 일시정지된다');
  docHidden = false;

  api.game.state = 'won';
  api.showEnd();
  const shareText = api.shareSummary();
  assert.ok(shareText.includes('NEON BASTION') && shareText.includes('방어 성공'), '결과 요약 문자열이 생성된다');
  const shareBtn = { dataset: { act: 'share' }, textContent: '결과 복사' };
  elements.get('#overlay').querySelector('.actions').onclick({ target: { closest: sel => sel === 'button' ? shareBtn : null } });
  await new Promise(r => setImmediate(r));
  assert.equal(copiedText, shareText, '결과 복사 버튼이 클립보드에 요약을 복사한다');
  assert.equal(shareBtn.textContent, '복사됨!', '복사 완료 피드백이 표시된다');

  console.log('PASS: daily menu decode redraw, ResizeObserver, endTimer cancel, pause guards, hotkeys/IME, AudioContext resume, maze preview, resume, auto-pause, share.');
})().catch(err => { console.error(err); process.exit(1); });
