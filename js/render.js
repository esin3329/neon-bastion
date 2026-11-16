// ─────────────────────────────────────────────────────────────
//  render.js — Canvas 2D 렌더러. 게임 상태를 읽기만 하고 수정하지 않는다.
// ─────────────────────────────────────────────────────────────
const TAU = Math.PI * 2;

function poly(ctx, x, y, r, n, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + i / n * TAU;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 타워 한 기 그리기 — 상점 아이콘에서도 같은 함수를 재사용
function drawTower(ctx, type, level, x, y, ang, time, flash) {
  const col = TOWERS[type].color;
  rrect(ctx, x - 16, y - 16, 32, 32, 7);
  ctx.fillStyle = '#131a2c'; ctx.fill();
  ctx.strokeStyle = col + '99'; ctx.lineWidth = 1.5; ctx.stroke();

  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = flash > 0 ? '#ffffff' : col;
  ctx.strokeStyle = col;
  ctx.shadowColor = col; ctx.shadowBlur = 8;
  switch (type) {
    case 'pulse':
      ctx.rotate(ang);
      ctx.fillRect(0, -3, 15, 6);
      ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, TAU); ctx.fill();
      break;
    case 'mortar':
      ctx.rotate(ang);
      ctx.fillRect(0, -5.5, 13, 11);
      poly(ctx, 0, 0, 10, 8, Math.PI / 8); ctx.fill();
      ctx.fillStyle = '#131a2c'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
      break;
    case 'frost':
      ctx.rotate(time * 0.8);
      ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 11); ctx.lineTo(-Math.cos(a) * 11, -Math.sin(a) * 11);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill();
      break;
    case 'tesla':
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 2.5 + Math.sin(time * 14) * 0.8, 0, TAU); ctx.fill();
      break;
    case 'rail':
      ctx.rotate(ang);
      ctx.fillRect(-4, -2, 22, 4);
      poly(ctx, 0, 0, 8.5, 4); ctx.fill();
      break;
  }
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  for (let i = 0; i <= level; i++) ctx.fillRect(x - 8 + i * 6, y + 11, 4, 2); // 레벨 표시
}

function drawEnemy(ctx, e, time) {
  const d = e.def, x = e.x + e.ox, y = e.y + e.oy - (e.flying ? 10 : 0), r = d.r;
  if (e.flying) { // 그림자로 고도 표현
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(e.x + e.ox, e.y + e.oy + 6, r, r * 0.5, 0, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = d.color + '33'; // 저렴한 글로우 (shadowBlur 대신 반투명 원)
  ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.fill();

  ctx.fillStyle = e.hitT > 0 ? '#ffffff' : d.color;
  switch (d.shape) {
    case 'tri':    poly(ctx, x, y, r + 2, 3, e.ang); ctx.fill(); break;
    case 'square': ctx.fillRect(x - r, y - r, r * 2, r * 2);
                   ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 2; ctx.strokeRect(x - r + 3, y - r + 3, r * 2 - 6, r * 2 - 6); break;
    case 'plus':   ctx.fillRect(x - r, y - 3, r * 2, 6); ctx.fillRect(x - 3, y - r, 6, r * 2); break;
    case 'wing':   poly(ctx, x, y, r + 3, 3, e.ang); ctx.fill();
                   poly(ctx, x, y, r, 4, e.ang + Math.PI / 4 + Math.sin(time * 18) * 0.25); ctx.fill(); break;
    case 'hex':    poly(ctx, x, y, r, 6, time); ctx.fill();
                   ctx.fillStyle = '#0a0e1a'; poly(ctx, x, y, r * 0.55, 6, -time * 1.5); ctx.fill();
                   ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); break;
    default:       ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  if (e.slowT > 0) { // 감속 상태 표시
    ctx.strokeStyle = '#90e0ef'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r + 3, 0, TAU); ctx.stroke();
  }
  if (e.hp < e.maxHp) {
    const w = Math.max(16, r * 2.2), k = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = '#00000099'; ctx.fillRect(x - w / 2, y - r - 8, w, 3);
    ctx.fillStyle = k > 0.5 ? '#80ed99' : k > 0.25 ? '#ffd166' : '#ff5d73';
    ctx.fillRect(x - w / 2, y - r - 8, w * k, 3);
  }
}

function render(ctx, game, ui, scale) {
  const fx = game.fx, t = game.time;
  ctx.setTransform(scale, 0, 0, scale, (Math.random() - 0.5) * fx.shake * scale, (Math.random() - 0.5) * fx.shake * scale);

  // 배경과 격자
  ctx.fillStyle = '#0a0e1a'; ctx.fillRect(-20, -20, W + 40, H + 40);
  ctx.strokeStyle = 'rgba(90,130,220,0.07)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= COLS; c++) { ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); }
  for (let r = 0; r <= ROWS; r++) { ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); }
  ctx.stroke();

  // 바위
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (game.grid[idx(c, r)] !== 1) continue;
    rrect(ctx, c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4, 6);
    ctx.fillStyle = '#1b2338'; ctx.fill();
    ctx.fillStyle = '#263150'; ctx.fillRect(c * CELL + 6, r * CELL + 5, CELL - 12, 3);
  }

  // 예상 진격로 (흐르는 점선)
  ctx.setLineDash([6, 10]); ctx.lineDashOffset = -t * 40;
  ctx.strokeStyle = 'rgba(255,93,115,0.38)'; ctx.lineWidth = 2;
  for (const path of game.paths) {
    ctx.beginPath();
    path.forEach(([c, r], i) => ctx[i ? 'lineTo' : 'moveTo'](cx(c), cx(r)));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 입구와 코어
  for (const [c, r] of game.spawns) {
    ctx.strokeStyle = '#ff5d73'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx(c), cx(r), 11 + Math.sin(t * 4) * 2, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#ff5d7355'; ctx.beginPath(); ctx.arc(cx(c), cx(r), 6, 0, TAU); ctx.fill();
  }
  ctx.save();
  ctx.shadowColor = '#4cc9f0'; ctx.shadowBlur = 22;
  ctx.fillStyle = '#4cc9f0'; poly(ctx, game.coreX, game.coreY, 15 + Math.sin(t * 3) * 1.5, 6, t * 0.5); ctx.fill();
  ctx.fillStyle = '#0a0e1a'; poly(ctx, game.coreX, game.coreY, 8, 6, -t * 0.8); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(game.coreX, game.coreY, 3, 0, TAU); ctx.fill();
  ctx.restore();

  // 프로스트 오라
  for (const tw of game.towers) {
    if (tw.type !== 'frost') continue;
    const range = tw.def.levels[tw.level].range, k = (t * 0.6 + tw.c * 0.13) % 1;
    ctx.fillStyle = 'rgba(144,224,239,0.05)';
    ctx.beginPath(); ctx.arc(tw.x, tw.y, range, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(144,224,239,${0.35 * (1 - k)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(tw.x, tw.y, range * k, 0, TAU); ctx.stroke();
  }

  for (const e of game.enemies) if (!e.flying) drawEnemy(ctx, e, t);
  for (const tw of game.towers) drawTower(ctx, tw.type, tw.level, tw.x, tw.y, tw.ang, t, tw.flash);
  for (const e of game.enemies) if (e.flying) drawEnemy(ctx, e, t);

  // 발사체
  ctx.save();
  ctx.shadowBlur = 10;
  for (const s of game.shots) {
    ctx.fillStyle = s.color; ctx.shadowColor = s.color;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.kind === 'shell' ? 4.5 : 3, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // 가산 혼합으로 빛 효과
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const b of fx.beams) {
    const k = b.life / b.max;
    ctx.globalAlpha = k; ctx.strokeStyle = b.color; ctx.lineWidth = b.width * (0.4 + k);
    ctx.beginPath(); b.pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y)); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.6, b.width * 0.3 * k); ctx.stroke();
  }
  for (const r of fx.rings) {
    const k = r.life / r.max;
    ctx.globalAlpha = k; ctx.strokeStyle = r.color; ctx.lineWidth = 3 * k + 0.5;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (1 - k * 0.7), 0, TAU); ctx.stroke();
  }
  for (const p of fx.parts) {
    ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.restore();

  ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const tx of fx.texts) {
    ctx.globalAlpha = Math.min(1, tx.life / tx.max * 2);
    ctx.fillStyle = '#000000aa'; ctx.fillText(tx.str, tx.x + 1, tx.y + 1);
    ctx.fillStyle = tx.color; ctx.fillText(tx.str, tx.x, tx.y);
  }
  ctx.globalAlpha = 1;

  // 선택한 타워의 사거리
  const sel = ui.selected;
  if (sel) rangeCircle(ctx, sel.x, sel.y, sel.def.levels[sel.level].range, sel.def.color);

  // 건설 미리보기
  if (ui.build && ui.hover) {
    const [c, r] = ui.hover, def = TOWERS[ui.build], ok = ui.valid && game.gold >= def.levels[0].cost;
    rangeCircle(ctx, cx(c), cx(r), def.levels[0].range, ok ? def.color : '#ff5d73');
    ctx.globalAlpha = 0.6;
    drawTower(ctx, ui.build, 0, cx(c), cx(r), -Math.PI / 2, t, 0);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? '#80ed99' : '#ff5d73'; ctx.lineWidth = 2;
    rrect(ctx, c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2, 7); ctx.stroke();
  }
}

function rangeCircle(ctx, x, y, range, color) {
  ctx.fillStyle = color + '14'; ctx.strokeStyle = color + 'aa'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, range, 0, TAU); ctx.fill(); ctx.stroke();
}
