// ─────────────────────────────────────────────────────────────
//  render.js — Canvas 2D 렌더러. 게임 상태를 읽기만 하고 수정하지 않는다.
// ─────────────────────────────────────────────────────────────
const TAU = Math.PI * 2;
const sceneSprites = {};
for (const [name, src] of Object.entries(SCENE_SPRITES)) {
  const image = new Image();
  image.src = src;
  sceneSprites[name] = image;
}
const enemyIcons = {};
for (const [type, { icon }] of Object.entries(ENEMIES)) {
  if (!icon) continue;
  const image = new Image();
  image.src = icon;
  enemyIcons[type] = image;
}
const towerSprites = {};
for (const { sprite } of Object.values(TOWERS).flatMap(tower => tower.branches)) {
  if (!sprite) continue;
  const image = new Image();
  image.src = sprite.src;
  towerSprites[sprite.src] = image;
}

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
// branch: 3레벨 특화 번호 (없으면 null)
function drawTower(ctx, type, level, x, y, ang, time, flash, branch = null) {
  const col = TOWERS[type].color;
  const sprite = TOWERS[type].branches[branch]?.sprite, image = towerSprites[sprite?.src];
  if (image?.naturalWidth) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(type === 'frost' ? time * 0.8 : type === 'tesla' ? 0 : ang);
    if (flash > 0) ctx.filter = 'brightness(1.8)';
    ctx.drawImage(image, -sprite.pivot[0] * CELL, -sprite.pivot[1] * CELL, CELL, CELL);
    ctx.restore();
  } else {
    rrect(ctx, x - 16, y - 16, 32, 32, 7);
    ctx.fillStyle = '#131a2c'; ctx.fill();
    ctx.strokeStyle = branch != null ? '#ffd166' : col + '99'; ctx.lineWidth = branch != null ? 2 : 1.5; ctx.stroke();

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = flash > 0 ? '#ffffff' : col;
    ctx.strokeStyle = col;
    ctx.shadowColor = col; ctx.shadowBlur = 8;
    switch (type) {
      case 'pulse':
        ctx.rotate(ang);
        if (branch === 0) { ctx.fillRect(0, -5, 15, 2.5); ctx.fillRect(0, -1.25, 17, 2.5); ctx.fillRect(0, 2.5, 15, 2.5); }      // 개틀링: 3연장
        else if (branch === 1) { for (const a of [-0.45, 0, 0.45]) { ctx.save(); ctx.rotate(a); ctx.fillRect(0, -2, 14, 4); ctx.restore(); } } // 멀티샷: 부채꼴
        else ctx.fillRect(0, -3, 15, 6);
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
      case 'laser':
        ctx.rotate(ang);
        if (branch === 1) { for (const a of [-0.35, 0, 0.35]) { ctx.save(); ctx.rotate(a); ctx.fillRect(4, -1.5, 11, 3); ctx.restore(); } } // 분광: 세 갈래 렌즈
        else ctx.fillRect(0, -2.5, branch === 0 ? 17 : 14, 5);
        poly(ctx, 0, 0, 8, 4, Math.PI / 4); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
        break;
      case 'amp': {
        const p = 1 + Math.sin(time * 3) * 0.12;
        ctx.lineWidth = 2;
        poly(ctx, 0, 0, 11, 6, Math.PI / 6); ctx.stroke();
        if (branch === 1) { ctx.lineWidth = 1; poly(ctx, 0, 0, 14, 6, Math.PI / 6); ctx.stroke(); } // 공명장: 바깥 고리
        poly(ctx, 0, 0, (branch === 0 ? 7 : 5.5) * p, 6, Math.PI / 6); ctx.fill();
        break;
      }
      case 'missile':
        ctx.rotate(ang);
        for (const oy of branch === 0 ? [-8, -3, 2, 7] : [-6, 2]) ctx.fillRect(-5, oy - 1, 15, branch === 0 ? 3 : 4); // 발사관
        ctx.beginPath(); ctx.arc(-2, 0, 6, 0, TAU); ctx.fill();
        if (branch === 1) { ctx.fillStyle = '#48cae4'; ctx.beginPath(); ctx.arc(-2, 0, 2.5, 0, TAU); ctx.fill(); }
        break;
    }
    ctx.restore();
  }

  ctx.fillStyle = branch != null ? '#ffd166' : '#ffffff';
  for (let i = 0; i <= level; i++) ctx.fillRect(x - 8 + i * 6, y + (image?.naturalWidth ? 15 : 11), 4, 2); // 레벨 표시
}

function drawEnemy(ctx, e, time) {
  const d = e.def, x = e.x + e.ox, y = e.y + e.oy - (e.flying ? 10 : 0), r = d.r;
  if (e.flying) { // 그림자로 고도 표현
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(e.x + e.ox, e.y + e.oy + 6, r, r * 0.5, 0, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = d.color + '33'; // 저렴한 글로우 (shadowBlur 대신 반투명 원)
  ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.fill();

  const icon = enemyIcons[e.type];
  if (icon?.naturalWidth) {
    const size = r * 2.4;
    ctx.save();
    ctx.translate(x, y);
    if (e.flying) ctx.rotate(e.ang + Math.PI / 2); // 스프라이트의 기본 방향은 위쪽
    if (e.hitT > 0) ctx.filter = 'brightness(0) invert(1)';
    ctx.drawImage(icon, -size / 2, -size / 2, size, size);
    ctx.restore();
  } else {
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
      case 'diamond': poly(ctx, x, y, r + 2, 4, 0); ctx.fill(); break;
      case 'blob':   for (let i = 0; i < 3; i++) { // 분열 직전처럼 꿈틀대는 세 덩어리
                       const a = i / 3 * TAU + time * 2;
                       ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, r * 0.65, 0, TAU); ctx.fill();
                     } break;
      default:       ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }
  if (e.shield > 1) { // 실드: 남은 양만큼 밝은 고리
    ctx.strokeStyle = `rgba(72,202,228,${0.35 + 0.6 * e.shield / e.maxShield})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r + 5, 0, TAU); ctx.stroke();
  }
  if (e.stasisT > 0 && sceneSprites.stasis.naturalWidth) {
    const size = (r + 7) * 2.5;
    ctx.save();
    ctx.globalAlpha = Math.min(1, e.stasisT / 0.3);
    ctx.drawImage(sceneSprites.stasis, x - size / 2, y - size / 2, size, size);
    ctx.restore();
  } else if (e.stunT > 0) { // 빙결·이미지 로딩 중: 얼음 육각형
    ctx.fillStyle = 'rgba(200,240,255,0.35)'; ctx.strokeStyle = '#e0fbff'; ctx.lineWidth = 1.5;
    poly(ctx, x, y, r + 4, 6, 0); ctx.fill(); ctx.stroke();
  } else if (e.slowT > 0) { // 감속
    ctx.strokeStyle = e.vulnT > 0 ? '#c77dff' : '#90e0ef'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r + 3, 0, TAU); ctx.stroke();
  }
  const w = Math.max(16, r * 2.2);
  if (e.hp < e.maxHp) {
    const k = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = '#00000099'; ctx.fillRect(x - w / 2, y - r - 8, w, 3);
    ctx.fillStyle = k > 0.5 ? '#80ed99' : k > 0.25 ? '#ffd166' : '#ff5d73';
    ctx.fillRect(x - w / 2, y - r - 8, w * k, 3);
  }
  if (e.maxShield && e.shield < e.maxShield) {
    ctx.fillStyle = '#00000099'; ctx.fillRect(x - w / 2, y - r - 12, w, 2);
    ctx.fillStyle = '#48cae4'; ctx.fillRect(x - w / 2, y - r - 12, w * e.shield / e.maxShield, 2);
  }
}

function render(ctx, game, ui, scale) {
  const fx = game.fx, t = game.time, shake = ui.paused ? 0 : fx.shake;
  ctx.setTransform(scale, 0, 0, scale, shake ? (Math.random() - 0.5) * shake * scale : 0, shake ? (Math.random() - 0.5) * shake * scale : 0);

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
    if (sceneSprites.blocked.naturalWidth) {
      ctx.drawImage(sceneSprites.blocked, c * CELL, r * CELL, CELL, CELL);
    } else {
      rrect(ctx, c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4, 6);
      ctx.fillStyle = '#1b2338'; ctx.fill();
      ctx.fillStyle = '#263150'; ctx.fillRect(c * CELL + 6, r * CELL + 5, CELL - 12, 3);
    }
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
    if (sceneSprites.spawn.naturalWidth) {
      const size = 34 + Math.sin(t * 4) * 2;
      ctx.drawImage(sceneSprites.spawn, cx(c) - size / 2, cx(r) - size / 2, size, size);
    } else {
      ctx.strokeStyle = '#ff5d73'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx(c), cx(r), 11 + Math.sin(t * 4) * 2, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ff5d7355'; ctx.beginPath(); ctx.arc(cx(c), cx(r), 6, 0, TAU); ctx.fill();
    }
  }
  ctx.save();
  ctx.shadowColor = '#4cc9f0'; ctx.shadowBlur = 22;
  if (sceneSprites.core.naturalWidth) {
    const size = 40 + Math.sin(t * 3) * 2;
    ctx.drawImage(sceneSprites.core, game.coreX - size / 2, game.coreY - size / 2, size, size);
  } else {
    ctx.fillStyle = '#4cc9f0'; poly(ctx, game.coreX, game.coreY, 15 + Math.sin(t * 3) * 1.5, 6, t * 0.5); ctx.fill();
    ctx.fillStyle = '#0a0e1a'; poly(ctx, game.coreX, game.coreY, 8, 6, -t * 0.8); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(game.coreX, game.coreY, 3, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // 프로스트 오라
  for (const tw of game.towers) {
    if (tw.type !== 'frost') continue;
    const range = game.stats(tw).range, k = (t * 0.6 + tw.c * 0.13) % 1;
    ctx.fillStyle = 'rgba(144,224,239,0.05)';
    ctx.beginPath(); ctx.arc(tw.x, tw.y, range, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(144,224,239,${0.35 * (1 - k)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(tw.x, tw.y, range * k, 0, TAU); ctx.stroke();
  }

  // 증폭기와 강화받는 타워를 잇는 선
  ctx.setLineDash([3, 5]); ctx.lineDashOffset = -t * 20;
  ctx.strokeStyle = 'rgba(128,255,219,0.35)'; ctx.lineWidth = 1.5;
  for (const tw of game.towers) {
    if (!tw.def.support || !tw.links?.length) continue;
    ctx.beginPath();
    for (const o of tw.links) { ctx.moveTo(tw.x, tw.y); ctx.lineTo(o.x, o.y); }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 네이팜 불길
  for (const z of game.zones) {
    const k = Math.min(1, z.t / 0.4), fl = 0.85 + Math.sin(t * 30 + z.x) * 0.15;
    const g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
    g.addColorStop(0, `rgba(255,120,30,${0.45 * k * fl})`); g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
  }

  for (const e of game.enemies) if (e.alive && !e.flying) drawEnemy(ctx, e, t);
  for (const tw of game.towers) drawTower(ctx, tw.type, tw.level, tw.x, tw.y, tw.ang, t, tw.flash, tw.branch);
  for (const e of game.enemies) if (e.alive && e.flying) drawEnemy(ctx, e, t);

  // 발사체
  ctx.save();
  ctx.shadowBlur = 10;
  for (const s of game.shots) {
    ctx.fillStyle = s.color; ctx.shadowColor = s.color;
    if (s.kind === 'missile') {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ang);
      ctx.fillRect(-5, -1.5, 10, 3);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(-9, -1, 4, 2); // 분사 불꽃
      ctx.restore();
      continue;
    }
    ctx.beginPath(); ctx.arc(s.x, s.y, s.kind === 'shell' ? 4.5 : 3, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // 가산 혼합으로 빛 효과
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const tw of game.towers) { // 레이저: 배율이 오를수록 굵고 밝아진다
    if (tw.type !== 'laser' || !tw.beams?.length) continue;
    const s = game.stats(tw), k = Math.min(1, tw.lockT / s.rampT);
    const sx = tw.x + Math.cos(tw.ang) * 14, sy = tw.y + Math.sin(tw.ang) * 14;
    for (const e of tw.beams) {
      if (!e.alive) continue;
      const ex = e.x + e.ox, ey = e.y + e.oy - (e.flying ? 10 : 0);
      ctx.globalAlpha = 0.45 + 0.4 * k; ctx.strokeStyle = tw.def.color; ctx.lineWidth = 2 + k * 3 + Math.sin(t * 40) * 0.4;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8 + k; ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  for (const b of fx.beams) {
    const k = b.life / b.max;
    ctx.globalAlpha = k; ctx.strokeStyle = b.color; ctx.lineWidth = b.width * (0.4 + k);
    ctx.beginPath(); b.pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y)); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(0.6, b.width * 0.3 * k); ctx.stroke();
  }
  for (const r of fx.rings) {
    const k = r.life / r.max;
    const image = sceneSprites[r.sprite];
    if (image?.naturalWidth) {
      const size = r.r * (1 - k * 0.7) * 2.5;
      ctx.globalAlpha = k * 0.65;
      ctx.drawImage(image, r.x - size / 2, r.y - size / 2, size, size);
    } else {
      ctx.globalAlpha = k; ctx.strokeStyle = r.color; ctx.lineWidth = 3 * k + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (1 - k * 0.7), 0, TAU); ctx.stroke();
    }
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
  if (sel) rangeCircle(ctx, sel.x, sel.y, game.stats(sel).range, sel.def.color);

  // 궤도 폭격 조준
  if (ui.skill === 'strike' && ui.mouse) {
    const sk = SKILLS.strike, [mx, my] = ui.mouse;
    rangeCircle(ctx, mx, my, sk.radius, sk.color);
    ctx.strokeStyle = sk.color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(mx - 10, my); ctx.lineTo(mx + 10, my); ctx.moveTo(mx, my - 10); ctx.lineTo(mx, my + 10); ctx.stroke();
  }

  // 건설 미리보기
  if (ui.build && ui.hover) {
    const [c, r] = ui.hover, def = TOWERS[ui.build], ok = ui.valid && game.gold >= def.levels[0].cost;
    const onPath = game.paths.some(p => p.some(([pc, pr]) => pc === c && pr === r));
    if (ui.valid && ui.previewPaths && (ui.previewDelta > 0 || onPath)) {
      ctx.save();
      ctx.setLineDash([6, 8]); ctx.lineDashOffset = -t * 45;
      ctx.strokeStyle = 'rgba(76,201,240,0.78)'; ctx.lineWidth = 2.5;
      for (const path of ui.previewPaths) {
        ctx.beginPath();
        path.forEach(([pc, pr], i) => ctx[i ? 'lineTo' : 'moveTo'](cx(pc), cx(pr)));
        ctx.stroke();
      }
      ctx.restore();
    }
    if (ui.valid) {
      ctx.save();
      ctx.setLineDash([3, 5]); ctx.lineDashOffset = -t * 20;
      ctx.strokeStyle = 'rgba(128,255,219,0.75)'; ctx.lineWidth = 1.5;
      if (ui.build === 'amp') {
        const range = def.levels[0].range;
        ctx.beginPath();
        for (const o of game.towers) {
          if (!o.def.support && Math.hypot(o.x - cx(c), o.y - cx(r)) <= range) {
            ctx.moveTo(cx(c), cx(r)); ctx.lineTo(o.x, o.y);
          }
        }
        ctx.stroke();
      } else if (!def.support) {
        ctx.beginPath();
        for (const a of game.towers) {
          if (a.def.support && Math.hypot(cx(c) - a.x, cx(r) - a.y) <= game.stats(a).range) {
            ctx.moveTo(a.x, a.y); ctx.lineTo(cx(c), cx(r));
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    rangeCircle(ctx, cx(c), cx(r), def.levels[0].range, ok ? def.color : '#ff5d73');
    ctx.globalAlpha = 0.6;
    drawTower(ctx, ui.build, 0, cx(c), cx(r), -Math.PI / 2, t, 0);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? '#80ed99' : '#ff5d73'; ctx.lineWidth = 2;
    rrect(ctx, c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2, 7); ctx.stroke();
    if (ui.valid && ui.previewDelta > 0) {
      const bx = Math.max(28, Math.min(W - 28, cx(c))), by = Math.max(20, r * CELL - 12);
      ctx.save();
      rrect(ctx, bx - 24, by - 10, 48, 20, 6);
      ctx.fillStyle = 'rgba(10,14,26,0.92)'; ctx.fill();
      ctx.strokeStyle = '#80ed99'; ctx.lineWidth = 1; ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = '#80ed99';
      ctx.fillText(`+${ui.previewDelta}칸`, bx, by + 4);
      ctx.restore();
    }
  }

  // 웨이브·보스·변이 배너
  if (fx.banner) {
    const bn = fx.banner, elapsed = bn.max - bn.life;
    const alpha = Math.min(1, elapsed / 0.25, bn.life / 0.45);
    const bw = Math.min(W - 40, Math.max(250, Math.max(bn.title.length * 14, bn.sub.length * 11) + 48));
    const bh = bn.sub ? 52 : 34, bx = (W - bw) / 2, by = 14;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    rrect(ctx, bx, by, bw, bh, 10);
    ctx.fillStyle = 'rgba(10,14,26,0.9)'; ctx.fill();
    ctx.strokeStyle = bn.color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '700 15px system-ui, sans-serif'; ctx.fillStyle = bn.color;
    ctx.fillText(bn.title, W / 2, by + 22);
    if (bn.sub) {
      ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#dfe7ff';
      ctx.fillText(bn.sub, W / 2, by + 40);
    }
    ctx.restore();
  }

  // 첫 시작 안내 배지
  if (game.wave === 0 && game.state === 'build' && !game.towers.length && !ui.paused) {
    const hw = 410, hx = (W - hw) / 2, hy = H - 38;
    ctx.save();
    rrect(ctx, hx, hy, hw, 28, 99);
    ctx.fillStyle = 'rgba(10,14,26,0.85)'; ctx.fill();
    ctx.strokeStyle = 'rgba(76,201,240,0.45)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = '#dfe7ff';
    ctx.fillText('타워를 선택해 미로를 설계하고 [웨이브 시작]을 누르세요', W / 2, hy + 18);
    ctx.restore();
  }

  // 일시정지 배지
  if (ui.paused) {
    ctx.save();
    ctx.fillStyle = 'rgba(6,9,19,0.22)'; ctx.fillRect(0, 0, W, H);
    const pw = 230, px = (W - pw) / 2, py = 14;
    rrect(ctx, px, py, pw, 34, 99);
    ctx.fillStyle = 'rgba(14,20,36,0.94)'; ctx.fill();
    ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = '700 13px system-ui, sans-serif'; ctx.fillStyle = '#dfe7ff';
    ctx.fillText('일시정지 · Space로 재개', W / 2, py + 22);
    ctx.restore();
  }
}

function rangeCircle(ctx, x, y, range, color) {
  ctx.fillStyle = color + '14'; ctx.strokeStyle = color + 'aa'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, range, 0, TAU); ctx.fill(); ctx.stroke();
}
