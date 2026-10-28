// 캐릭터 스프라이트 — 모두 캔버스 벡터로 직접 그리고, 프레임별로 미리 렌더링해 캐시한다.
// 모든 스프라이트는 오른쪽을 바라보는 모습으로 원점(0,0) 기준 약 ±40 단위 안에 그린다. 발끝은 y≈22.
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const OL = '#24160d';     // 외곽선
  const FRAMES = 6;         // 걷기 애니메이션 프레임 수
  const BOX = 44;           // 그리기 영역 반폭(단위)

  let g = null;             // 현재 그리는 2D 컨텍스트
  let lwScale = 1;          // 큰 스프라이트에서 외곽선이 지나치게 두꺼워지지 않게 보정

  // ── 색 / 도형 도우미 ─────────────────────────────────
  function rgb(h) {
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(h);
    if (m) return [+m[1], +m[2], +m[3]];
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function shade(h, amt) {
    const f = v => Math.round(Math.max(0, Math.min(255, amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
    const [r, gg, b] = rgb(h);
    return `rgb(${f(r)},${f(gg)},${f(b)})`;
  }
  function lin(x0, y0, x1, y1, c, hi = 0.22, lo = -0.22) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, shade(c, hi));
    gr.addColorStop(1, shade(c, lo));
    return gr;
  }
  function rad(x, y, r, c) {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.05);
    gr.addColorStop(0, shade(c, 0.3));
    gr.addColorStop(1, shade(c, -0.18));
    return gr;
  }
  function fs(fill, lw = 1.6) {
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (lw) {
      g.lineWidth = lw * lwScale;
      g.strokeStyle = OL;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.stroke();
    }
  }
  function ell(x, y, rx, ry, fill, lw, rot = 0) {
    g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); fs(fill, lw);
  }
  function circ(x, y, r, fill, lw) { ell(x, y, r, r, fill, lw); }
  function rrPath(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function rr(x, y, w, h, r, fill, lw) { g.beginPath(); rrPath(x, y, w, h, r); fs(fill, lw); }
  function poly(pts, fill, lw) {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    fs(fill, lw);
  }
  function stroke(pts, color, w, curve = false) {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    if (curve) g.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
    else for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.strokeStyle = color;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.stroke();
  }
  // 외곽선 있는 굵은 선(팔, 꼬리, 다리 등)
  function limb(pts, color, w, curve = false) {
    stroke(pts, OL, w + 2.4 * lwScale, curve);
    stroke(pts, color, w, curve);
  }
  function eye(x, y, s = 1, angry = false, dir = 1) {
    ell(x, y, 1.7 * s, 2.4 * s, OL, 0);
    circ(x + 0.6 * s, y - 0.9 * s, 0.75 * s, '#fff', 0);
    if (angry) stroke([x - 2.2 * s * dir, y - 4.4 * s, x + 2 * s * dir, y - 2.9 * s], OL, 1.3 * s);
  }
  // ── 사람형 캐릭터 ─────────────────────────────────────
  // o: { skin, robe, trim, belt, pants, shoe, hat, hatColor, hair, weapon, beard, mustache, armor,
  //      armorColor, dots, emblem, cape, angry, mask, legs(false=말 위) }
  function humanoid(f, o) {
    const s = Math.sin(f * TAU);
    const bob = o.legs === false ? 0 : -Math.abs(s) * 1.6;
    const skin = o.skin || '#f2c79c';
    const robe = o.robe || '#7a5a3a';
    const hx = 1, hy = -12 + bob, R = 11.5;

    // 망토 (몸 뒤)
    if (o.cape) {
      const sw = Math.sin(f * TAU + 1) * 1.5;
      poly([-6, -2 + bob, 4, -2 + bob, -4 + sw, 19, -15 + sw, 18], lin(-15, 0, 4, 18, o.cape), 1.6);
    }

    // 다리
    if (o.legs !== false) {
      for (const k of [-1, 1]) {
        const lx = k * 3.2 + k * s * 3.6;
        rr(lx - 2.8, 12 + bob * 0.3, 5.6, 9, 2, o.pants || shade(robe, -0.35), 1.5);
        ell(lx + 1.3, 21.6, 3.8, 2.2, o.shoe || '#3a2618', 1.5);
      }
    }

    // 뒤쪽 팔
    const bh = { x: -8 - s * 2.2, y: 6 + bob };
    limb([-3, 0 + bob, bh.x, bh.y], shade(robe, -0.15), 4.4);
    circ(bh.x, bh.y, 2.6, shade(skin, -0.1), 1.4);

    // 몸통 (저고리/도포)
    g.beginPath();
    g.moveTo(-7.5, -2 + bob);
    g.quadraticCurveTo(0, -4.5 + bob, 7.5, -2 + bob);
    g.quadraticCurveTo(10, 8 + bob, 11.5, 16 + bob * 0.4);
    g.quadraticCurveTo(0, 18.5 + bob * 0.4, -11.5, 16 + bob * 0.4);
    g.quadraticCurveTo(-10, 8 + bob, -7.5, -2 + bob);
    g.closePath();
    fs(lin(-10, -4, 10, 18, robe), 1.7);

    // 갑옷 비늘(찰갑)
    if (o.armor) {
      const ac = o.armorColor || '#8b6b3e';
      g.save();
      g.beginPath();
      rrPath(-9, 0 + bob, 18, 12, 3);
      g.clip();
      g.fillStyle = lin(-9, 0, 9, 12, ac);
      g.fillRect(-10, -1 + bob, 20, 14);
      g.strokeStyle = shade(ac, -0.45);
      g.lineWidth = 0.8;
      for (let row = 0; row < 4; row++) {
        for (let col = -3; col <= 3; col++) {
          g.beginPath();
          g.arc(col * 3 + (row % 2) * 1.5, 2 + row * 3 + bob, 1.6, 0, Math.PI);
          g.stroke();
        }
      }
      g.restore();
      g.beginPath(); rrPath(-9, 0 + bob, 18, 12, 3); fs(null, 1.4);
      // 어깨 보호대
      ell(-6, 0.5 + bob, 4.2, 3, lin(-10, -3, -2, 4, ac), 1.4);
    }

    // 점무늬 옷(고구려 벽화 느낌)
    if (o.dots) {
      g.fillStyle = o.dots;
      for (const [dx, dy] of [[-5, 3], [0, 1], [5, 4], [-7, 10], [-2, 8], [3, 11], [7, 13], [-4, 14]]) {
        g.beginPath(); g.arc(dx, dy + bob, 1.05, 0, TAU); g.fill();
      }
    }

    // 깃(옷깃)과 동정
    if (!o.armor) {
      stroke([-2, -2.5 + bob, 1, 3 + bob, 6, 7 + bob], OL, 3.6 * lwScale);
      stroke([-2, -2.5 + bob, 1, 3 + bob, 6, 7 + bob], o.trim || '#f3ecd9', 2.4);
    }

    // 흉배(곤룡포의 둥근 금장)
    if (o.emblem) {
      circ(2, 4 + bob, 4.3, rad(2, 4 + bob, 4.3, '#e8c25a'), 1.3);
      g.strokeStyle = '#a6431f';
      g.lineWidth = 0.9;
      g.beginPath(); g.arc(2, 4 + bob, 2.3, 0.3, 4.8); g.stroke();
    }

    // 허리띠
    rr(-10, 7.5 + bob, 20, 3.2, 1.4, o.belt || '#2d2018', 1.3);
    if (o.straps) {
      stroke([-6, -1 + bob, 6, 8 + bob], OL, 3 * lwScale);
      stroke([-6, -1 + bob, 6, 8 + bob], o.straps, 1.8);
    }
    if (o.beltKnot) ell(-6, 11 + bob, 1.6, 3, o.belt || '#2d2018', 1.1, 0.3);

    // 머리
    if (o.hat === 'hood') hoodBack(hx, hy, R, o);
    ell(hx - 3.5, hy + 1, 2.4, 3, shade(skin, -0.08), 1.3);           // 귀
    circ(hx, hy, R, rad(hx, hy, R, skin), 1.8);                         // 얼굴

    // 얼굴
    const ex = hx + 6.5, ey = hy + 0.5;
    eye(ex, ey, 1, o.angry, -1);
    eye(ex - 6, ey - 0.2, 0.9, o.angry, 1);
    ell(ex + 1.5, ey + 4.5, 2, 1.2, 'rgba(240,110,110,.45)', 0);       // 볼터치
    if (o.mask) {
      g.beginPath();
      g.moveTo(hx - 4, hy + 3);
      g.quadraticCurveTo(hx + 6, hy + 1.5, hx + R + 0.4, hy + 2);
      g.arc(hx, hy, R + 0.4, 0.17, Math.PI * 0.75);
      g.closePath();
      fs(o.maskColor || '#2b2b33', 1.4);
    } else if (o.beard) {
      g.beginPath();
      g.moveTo(hx + 1, hy + 5);
      g.quadraticCurveTo(hx + 6, hy + 7, hx + 10.5, hy + 4);
      g.quadraticCurveTo(hx + 9, hy + 14, hx + 4, hy + 15);
      g.quadraticCurveTo(hx + 1, hy + 11, hx + 1, hy + 5);
      fs(o.hair || '#2a1d14', 1.3);
      stroke([hx + 4.5, hy + 5, hx + 7, hy + 4.4, hx + 10.5, hy + 5.5], o.hair || '#2a1d14', 1.8, true);
    } else {
      stroke([ex - 1.5, ey + 5.6, ex + 0.3, ey + 6.6, ex + 2, ey + 5.6], OL, 1.1, true); // 입
      if (o.mustache) {
        stroke([ex - 2.5, ey + 4.7, ex + 0.2, ey + 3.6, ex + 3, ey + 4.9], o.hair || '#2a1d14', 1.6, true);
      }
    }

    hat(hx, hy, R, o, f);

    // 앞쪽 팔 + 무기
    const fh = { x: 9.5 + s * 1.6, y: 5 + bob };
    weaponBack(fh, o.weapon, f);
    limb([3, 0 + bob, fh.x, fh.y], robe, 4.6);
    if (o.armband) limb([4.6, 1.4 + bob, 6.2, 2.6 + bob], o.armband, 4.6);
    weapon(fh, o.weapon, f, o);
    circ(fh.x, fh.y, 2.8, rad(fh.x, fh.y, 2.8, skin), 1.4);
    weaponFront(fh, o.weapon);
  }

  function hairCap(hx, hy, R, color, back = 1) {
    g.beginPath();
    g.arc(hx, hy, R + 0.6, Math.PI * 0.82, Math.PI * 1.95);
    g.quadraticCurveTo(hx + 4, hy - 6, hx - 2, hy - 5.5);
    g.quadraticCurveTo(hx - 5, hy - 2, hx - 5 * back, hy + 5);
    g.closePath();
    fs(lin(hx, hy - R, hx, hy + 4, color, 0.18, -0.25), 1.6);
    // 머릿결 하이라이트
    stroke([hx - 6, hy - 8, hx - 1, hy - 11.5, hx + 5, hy - 10], 'rgba(255,255,255,.25)', 1.2, true);
  }

  function hoodBack(hx, hy, R, o) {
    circ(hx - 1, hy - 0.5, R + 2.6, lin(hx, hy - R, hx, hy + R, o.hatColor || '#2b2b33'), 1.7);
  }

  function hat(hx, hy, R, o, f) {
    const hair = o.hair || '#2a1d14';
    const hc = o.hatColor || '#3a2a20';
    switch (o.hat) {
      case 'messy': {
        g.beginPath();
        g.moveTo(hx - R - 1, hy + 4);
        const spikes = [[-13, -4], [-12, -11], [-8, -15], [-3, -17], [2, -16], [7, -14], [11, -10], [12.5, -5]];
        let px = hx - R, py = hy;
        for (const [sx, sy] of spikes) {
          const nx = hx + sx, ny = hy + sy;
          g.quadraticCurveTo((px + nx) / 2 + 1.5, (py + ny) / 2 + 2.5, nx, ny);
          px = nx; py = ny;
        }
        g.quadraticCurveTo(hx + 5, hy - 6, hx - 1, hy - 5);
        g.quadraticCurveTo(hx - 5, hy - 2, hx - 6, hy + 5);
        g.closePath();
        fs(lin(hx, hy - 16, hx, hy + 4, hair, 0.18, -0.25), 1.6);
        // 머리띠(가죽끈)
        stroke([hx - 10, hy - 4, hx + 1, hy - 8, hx + 11, hy - 5], OL, 3.2 * lwScale, true);
        stroke([hx - 10, hy - 4, hx + 1, hy - 8, hx + 11, hy - 5], '#c98f4a', 2, true);
        break;
      }
      case 'topknot': {
        hairCap(hx, hy, R, hair);
        circ(hx - 1.5, hy - R - 2.5, 3.8, lin(0, hy - R - 6, 0, hy - R, hair), 1.5);    // 상투
        rr(hx - 4.5, hy - R - 1.2, 6, 2.2, 1, o.band || '#d8b04a', 1.1);
        stroke([hx - 10.5, hy - 3.5, hx, hy - 9, hx + 11, hy - 4.5], OL, 3 * lwScale, true);
        stroke([hx - 10.5, hy - 3.5, hx, hy - 9, hx + 11, hy - 4.5], o.band || '#d8b04a', 1.8, true);
        // 머리띠 끈 휘날림
        const w = Math.sin(f * TAU) * 1.5;
        limb([hx - 10, hy - 3.5, hx - 15, hy - 1 + w, hx - 18, hy + 3 + w], o.band || '#d8b04a', 1.6, true);
        break;
      }
      case 'feather': {   // 고구려 조우관
        hairCap(hx, hy, R, hair);
        const sway = Math.sin(f * TAU) * 0.06;
        for (const [fx0, ang] of [[-3.5, -0.62], [3, 0.55]]) {
          g.save();
          g.translate(hx + fx0, hy - 15);
          g.rotate(ang + sway);
          g.beginPath();
          g.moveTo(0, 0);
          g.quadraticCurveTo(-3.2, -6, -0.6, -14);
          g.quadraticCurveTo(0.6, -15.5, 1.4, -14);
          g.quadraticCurveTo(3, -6, 0, 0);
          g.closePath();
          fs(lin(0, -15, 0, 0, '#f4ead0', 0.3, -0.15), 1.2);
          stroke([0, -1, 0.3, -13.5], 'rgba(150,120,80,.8)', 0.6);
          for (const y of [-5, -8, -11]) {
            stroke([0.1, y, -1.6, y + 1.2], 'rgba(150,120,80,.5)', 0.5);
            stroke([0.2, y, 1.6, y + 1.1], 'rgba(150,120,80,.5)', 0.5);
          }
          g.restore();
        }
        poly([hx - 8, hy - 7.5, hx + 7, hy - 7.5, hx + 3, hy - 17, hx - 4, hy - 17], lin(hx, hy - 17, hx, hy - 7, hc), 1.5);
        rr(hx - 9, hy - 9, 17, 3, 1.4, '#d8b04a', 1.2);
        break;
      }
      case 'royal': {     // 익선관
        hairCap(hx, hy, R, hair);
        ell(hx - 6.5, hy - 19.5, 3.4, 4.6, lin(0, hy - 24, 0, hy - 15, '#2a2a36'), 1.4, -0.5);
        ell(hx - 1.5, hy - 21, 3.4, 4.6, lin(0, hy - 25, 0, hy - 16, '#2a2a36'), 1.4, -0.2);
        g.beginPath();
        g.moveTo(hx - 10, hy - 6);
        g.quadraticCurveTo(hx - 11, hy - 18, hx - 1, hy - 18.5);
        g.quadraticCurveTo(hx + 9, hy - 18, hx + 9, hy - 6);
        g.closePath();
        fs(lin(hx, hy - 18, hx, hy - 6, '#262633', 0.25, -0.3), 1.6);
        rr(hx - 10.5, hy - 8, 20, 3, 1.4, '#3a3a4a', 1.2);
        break;
      }
      case 'helmet': {    // 조선 투구
        g.beginPath();
        g.arc(hx, hy - 3, R + 1.2, Math.PI, TAU);
        g.closePath();
        fs(lin(hx - 8, hy - 16, hx + 8, hy - 2, hc), 1.6);
        rr(hx - 13, hy - 4.5, 26, 3.4, 1.5, shade(hc, -0.25), 1.3);
        poly([hx - 1.2, hy - 15, hx + 1.2, hy - 15, hx + 0.4, hy - 22, hx - 0.4, hy - 22], '#d8b04a', 1.1);
        const sw = Math.sin(f * TAU) * 1.2;
        ell(hx - 3 + sw * 0.5, hy - 19, 3.4, 2.4, '#c8302a', 1.2, 0.5);
        limb([hx - 2, hy - 18, hx - 7, hy - 16 + sw, hx - 9, hy - 10 + sw], '#c8302a', 2.2, true);
        rr(hx - 13.5, hy - 2, 7, 11, 2.5, lin(hx - 13, 0, hx - 7, 0, shade(hc, -0.1)), 1.4);   // 목 가리개
        break;
      }
      case 'conical':
      case 'plume': {
        hairCap(hx, hy, R, hair);
        poly([hx - 13, hy - 4, hx + 12, hy - 4, hx + 1, hy - 21], lin(hx - 8, hy - 20, hx + 8, hy - 4, hc), 1.6);
        rr(hx - 13.5, hy - 5.5, 26, 3.2, 1.5, shade(hc, -0.25), 1.2);
        if (o.hat === 'plume') {
          const sw = Math.sin(f * TAU) * 1.5;
          ell(hx - 2 + sw * 0.4, hy - 24, 3, 5.5, lin(0, hy - 30, 0, hy - 19, o.plume || '#c8302a'), 1.3, -0.5);
          limb([hx - 1, hy - 22, hx - 8, hy - 22 + sw, hx - 12, hy - 15 + sw], o.plume || '#c8302a', 2.4, true);
        }
        break;
      }
      case 'hood':
        break;
      case 'kepi': {      // 19세기 서양 군모
        hairCap(hx, hy, R, hair);
        poly([hx - 9, hy - 6, hx + 8, hy - 6, hx + 6.5, hy - 19, hx - 9.5, hy - 17], lin(hx - 9, hy - 19, hx + 8, hy - 6, hc), 1.6);
        rr(hx - 10, hy - 9, 19, 3.4, 1, o.band || '#2f4f9a', 1.2);
        poly([hx + 4, hy - 6.5, hx + 13, hy - 5, hx + 12, hy - 3.5, hx + 3, hy - 4.5], '#2a2420', 1.2);   // 챙
        break;
      }
      case 'cap': {       // 챙 달린 군모
        hairCap(hx, hy, R, hair);
        g.beginPath();
        g.moveTo(hx - 11, hy - 6);
        g.quadraticCurveTo(hx - 12, hy - 16, hx, hy - 16.5);
        g.quadraticCurveTo(hx + 12, hy - 16, hx + 11, hy - 7);
        g.closePath();
        fs(lin(hx, hy - 17, hx, hy - 6, hc), 1.6);
        rr(hx - 11.5, hy - 8.5, 22, 3.2, 1.2, o.band || shade(hc, -0.35), 1.2);
        poly([hx + 5, hy - 6.5, hx + 14, hy - 5, hx + 13, hy - 3.2, hx + 4, hy - 4.6], '#2a2420', 1.2);
        break;
      }
      case 'fur': {
        g.beginPath();
        g.arc(hx, hy - 4, R + 0.5, Math.PI * 1.02, Math.PI * 1.98);
        g.closePath();
        fs(lin(hx, hy - 16, hx, hy - 4, hc), 1.6);
        ell(hx, hy - 15.5, 2.4, 2.4, '#c8302a', 1.2);
        rr(hx - 13, hy - 7.5, 25, 5.5, 2.7, lin(0, hy - 8, 0, hy - 2, o.fur || '#d9c49a'), 1.5);
        for (let i = -10; i <= 9; i += 3.2) stroke([hx + i, hy - 6.5, hx + i + 1, hy - 3.5], shade(o.fur || '#d9c49a', -0.3), 0.7);
        break;
      }
      case 'jingasa': {
        hairCap(hx, hy, R, hair);
        poly([hx - 16, hy - 5, hx + 16, hy - 5, hx + 2, hy - 16, hx - 2, hy - 16], lin(hx - 16, hy - 16, hx + 16, hy - 5, hc), 1.6);
        stroke([hx - 14, hy - 5.5, hx + 14, hy - 5.5], shade(hc, 0.3), 0.8);
        break;
      }
      case 'bandana': {
        g.beginPath();
        g.arc(hx, hy - 1, R + 0.8, Math.PI * 0.95, Math.PI * 1.98);
        g.quadraticCurveTo(hx, hy - 6, hx - R, hy + 1);
        g.closePath();
        fs(lin(hx, hy - R, hx, hy - 3, o.hatColor || '#b8322a'), 1.6);
        g.fillStyle = 'rgba(255,255,255,.75)';
        for (const [dx, dy] of [[-4, -8], [2, -10], [7, -7], [-8, -3]]) { g.beginPath(); g.arc(hx + dx, hy + dy, 0.9, 0, TAU); g.fill(); }
        const w = Math.sin(f * TAU) * 1.4;
        ell(hx - 13, hy - 2 + w, 3.6, 1.8, o.hatColor || '#b8322a', 1.2, 0.5);
        ell(hx - 12.5, hy + 2 + w, 3.4, 1.6, o.hatColor || '#b8322a', 1.2, -0.4);
        break;
      }
      default:
        hairCap(hx, hy, R, hair);
    }
  }

  // 무기 — 손 뒤에 그릴 부분 / 손에 쥔 부분 / 손 앞에 그릴 부분
  function weaponBack(h, w) {
    if (w === 'bow') {
      g.save();
      g.translate(h.x + 1.5, h.y - 1);
      stroke([0, -15, 0, 15], 'rgba(245,235,210,.9)', 0.8);
      g.restore();
    }
  }
  function weapon(h, w, f, o) {
    g.save();
    g.translate(h.x, h.y);
    switch (w) {
      case 'bow': {
        g.translate(1.5, -1);
        limb([0, -15, 10, 0, 0, 15], '#8a5a2b', 2.2, true);
        rr(-1.6, -3, 3.2, 6, 1, '#c8302a', 1);
        break;
      }
      case 'sword':
      case 'bigsword': {
        const L = w === 'bigsword' ? 25 : 19;
        g.rotate(-1.05 + Math.sin(f * TAU) * 0.08);
        poly([2, -1.6, L, -1.3, L + 3.5, 0, L, 1.3, 2, 1.6], lin(0, -2, 0, 2, '#e3e9f0', 0.3, -0.25), 1.3);
        stroke([4, 0, L - 1, 0], 'rgba(255,255,255,.7)', 0.6);
        rr(0, -4, 2.6, 8, 1, '#d8b04a', 1.1);
        rr(-6.5, -1.6, 6.5, 3.2, 1.2, '#5a3220', 1.1);
        break;
      }
      case 'bipa': {
        g.rotate(-1.05);
        poly([2, -1.4, 8, -3.2, 12, -1.6, 15, -3, 21, 0, 15, 3, 12, 1.6, 8, 3.2, 2, 1.4], lin(0, -3, 0, 3, '#d9a54e', 0.3, -0.2), 1.3);
        stroke([3, 0, 19, 0], 'rgba(120,70,20,.6)', 0.7);
        rr(-6, -1.6, 6, 3.2, 1.2, '#5a3220', 1.1);
        break;
      }
      case 'saber': {
        g.rotate(-1.0);
        g.beginPath();
        g.moveTo(2, -1.5);
        g.quadraticCurveTo(12, -3, 20, -6);
        g.quadraticCurveTo(14, 0, 2, 1.6);
        g.closePath();
        fs(lin(0, -4, 0, 2, '#e3e9f0', 0.3, -0.25), 1.3);
        rr(0, -3.5, 2.4, 7, 1, '#d8b04a', 1);
        rr(-6, -1.5, 6, 3, 1.2, '#4a2a1a', 1);
        break;
      }
      case 'dagger': {
        g.rotate(-0.5);
        poly([1.5, -1.3, 10, -0.6, 12, 0, 10, 0.6, 1.5, 1.3], '#d5dde6', 1.2);
        rr(-4, -1.3, 4.5, 2.6, 1, '#3a2418', 1);
        break;
      }
      case 'spear':
      case 'halberd': {
        g.rotate(-1.25);
        rr(-14, -1.1, 36, 2.2, 1, lin(0, -1, 0, 1, '#8a5a2b'), 1.1);
        poly([22, -2.2, 29, 0, 22, 2.2], lin(22, -2, 29, 2, '#d5dde6'), 1.2);
        if (w === 'halberd') {
          g.beginPath();
          g.moveTo(19, -1);
          g.quadraticCurveTo(17, -9, 22, -10);
          g.quadraticCurveTo(20, -5, 23, -1);
          g.closePath();
          fs('#d5dde6', 1.2);
        }
        ell(20.5, 2.5, 1.6, 3, '#c8302a', 1, 0.3);
        break;
      }
      case 'gun': {
        g.rotate(-0.2);
        rr(-9, -2.3, 10, 4.6, 2, lin(0, -2, 0, 2, '#8a5a2b'), 1.2);
        rr(0, -1.5, 22, 3, 1, lin(0, -1.5, 0, 1.5, '#4a4a52', 0.3, -0.3), 1.2);
        rr(19, -2, 3, 4, 1, '#2a2a30', 1);
        stroke([2, 2, 2, 4.5], '#c8302a', 1.2);
        break;
      }
      case 'rifle': {
        g.rotate(-0.95);
        rr(-12, -2, 13, 4.4, 2, lin(0, -2, 0, 2, '#7a5230'), 1.2);
        rr(0, -1.3, 20, 2.6, 1, lin(0, -1.3, 0, 1.3, '#4a4a52', 0.3, -0.3), 1.1);
        poly([20, -0.8, 27, 0, 20, 0.8], '#d5dde6', 0.9);
        break;
      }
      case 'handaxe': {
        g.rotate(0.6);
        handaxeShape(5, -1, 0.65);
        break;
      }
      case 'staff': {
        g.rotate(-0.12);
        limb([0, 16, 0.5, 4, -0.5, -20], '#8a5a2b', 2.6, true);
        limb([-0.5, -20, -3.5, -24, -1, -27], '#8a5a2b', 2.2, true);
        ell(2.2, -23, 2.4, 1.4, '#5fa04a', 1, -0.6);
        ell(-4.4, -21, 2.2, 1.3, '#5fa04a', 1, 0.5);
        break;
      }
      case 'book': {
        g.rotate(-0.15);
        rr(-3, -8, 10, 12, 1.5, lin(-3, -8, 7, 4, '#2f5d8a'), 1.3);
        rr(-1.5, -6.5, 7, 9, 1, '#f3ecd9', 0.8);
        stroke([0, -4.5, 4, -4.5], '#7a6a55', 0.6);
        stroke([0, -2.5, 4, -2.5], '#7a6a55', 0.6);
        stroke([0, -0.5, 3, -0.5], '#7a6a55', 0.6);
        break;
      }
    }
    g.restore();
  }
  function weaponFront(h, w) {
    if (w === 'bow') {
      // 화살 한 대를 메긴 모습
      g.save();
      g.translate(h.x + 1.5, h.y - 1);
      stroke([-4, 0, 13, 0], '#e8d9b0', 1.2);
      poly([13, -1.8, 16, 0, 13, 1.8], '#cfd6de', 0.8);
      g.restore();
    }
  }

  function handaxeShape(x, y, k = 1) {
    g.save();
    g.translate(x, y);
    g.scale(k, k);
    g.beginPath();
    g.moveTo(0, -12);
    g.quadraticCurveTo(8, -4, 7, 4);
    g.quadraticCurveTo(5, 11, 0, 11);
    g.quadraticCurveTo(-5, 11, -7, 4);
    g.quadraticCurveTo(-8, -4, 0, -12);
    g.closePath();
    fs(lin(-7, -12, 7, 11, '#a39684', 0.25, -0.3), 1.8);
    // 뗀 자국(박리면)
    g.strokeStyle = 'rgba(60,45,30,.45)';
    g.lineWidth = 0.9;
    for (const [a, b, c, d] of [[-4, -4, 1, -2], [3, -5, 0, 1], [-5, 3, 0, 5], [4, 3, 0, 7], [-2, -8, 2, -6]]) {
      g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke();
    }
    g.restore();
  }

  // ── 동물 ─────────────────────────────────────────────
  function legs4(f, xs, top, len, color, w = 3.2, hoof) {
    xs.forEach((x, i) => {
      const ph = Math.sin(f * TAU + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0));
      const fx = x + ph * 3;
      limb([x, top, (x + fx) / 2 + 0.5, top + len * 0.55, fx, top + len], color, w, true);
      if (hoof) ell(fx + 0.6, top + len + 0.6, w * 0.65, 1.3, hoof, 1);
    });
  }

  function rat(f) {
    const s = Math.sin(f * TAU);
    limb([-10, 10, -20, 13 + s * 2, -25, 5], '#e3a7a0', 1.6, true);
    legs4(f, [-6, 5, -3, 7], 12, 7, '#d49c94', 2);
    ell(-1, 8 + s * 0.6, 12, 8, lin(-12, 0, 12, 16, '#958a84'), 1.7);
    ell(-2, 11, 8, 3.5, 'rgba(230,220,215,.55)', 0);
    g.beginPath();
    g.moveTo(5, 1 + s * 0.6);
    g.quadraticCurveTo(16, 1, 19, 7);
    g.quadraticCurveTo(14, 12, 5, 12);
    g.closePath();
    fs(lin(5, 0, 19, 12, '#a39892'), 1.6);
    circ(18.8, 6.8, 1.5, '#e07a84', 1);
    circ(6, 0, 3.6, '#e3a7a0', 1.4);
    circ(6, 0, 2, '#c97a80', 0);
    eye(12.5, 4.5, 0.75, true, -1);
    stroke([17, 8, 23, 7], 'rgba(40,30,20,.6)', 0.5);
    stroke([17, 8.5, 22.5, 10], 'rgba(40,30,20,.6)', 0.5);
  }

  function boar(f) {
    const s = Math.sin(f * TAU);
    limb([-16, 2, -21, 0, -20, -4], '#5a3d28', 1.6, true);
    legs4(f, [-10, 6, -6, 10], 9, 11, '#4a3220', 3.4, '#2a1a10');
    ell(-2, 4 + s * 0.6, 17, 11, lin(-18, -6, 14, 14, '#7a5536'), 1.8);
    // 등 갈기
    g.beginPath();
    g.moveTo(-15, -2);
    for (let i = 0; i <= 8; i++) g.lineTo(-15 + i * 3.4, -7 - (i % 2) * 3 + Math.sin(i) * 0.6);
    g.lineTo(12, -2);
    g.closePath();
    fs('#3a281a', 1.3);
    ell(-3, 9, 11, 4, 'rgba(160,120,90,.35)', 0);
    circ(13, 4, 8.5, rad(13, 4, 8.5, '#80593a'), 1.7);
    poly([8, -2, 11, -9, 14, -3], '#5a3d28', 1.3);
    ell(20.5, 7, 3.6, 3.2, '#c99a82', 1.4);
    circ(20.8, 6, 0.7, OL, 0); circ(21, 8, 0.7, OL, 0);
    g.beginPath(); g.moveTo(17, 10); g.quadraticCurveTo(21, 11, 20, 4); g.quadraticCurveTo(20, 9, 16, 8.5); g.closePath(); fs('#f5ecd8', 1.1);
    eye(15.5, 2, 0.8, true, -1);
  }

  function wolf(f) {
    const s = Math.sin(f * TAU);
    ell(-17, -1 + s, 8, 3.6, lin(-25, -4, -10, 4, '#7d828c'), 1.6, -0.5);
    legs4(f, [-10, 7, -6, 10], 7, 14, '#6d727c', 3, '#3a3a40');
    ell(-1, 3 + s * 0.5, 15, 8.5, lin(-15, -5, 15, 11, '#8a909a'), 1.8);
    ell(0, 7, 10, 3.5, 'rgba(230,230,235,.55)', 0);
    // 머리
    poly([8, -6, 23, -2, 22, 1, 10, 4], lin(8, -6, 23, 4, '#9aa0aa'), 1.6);
    circ(11, -4, 7, rad(11, -4, 7, '#8f95a0'), 1.7);
    poly([6, -9, 8, -16, 11, -9], '#7d828c', 1.4);
    poly([10, -9, 13.5, -15.5, 15, -8], '#7d828c', 1.4);
    poly([11, -10, 13, -14, 13.5, -9], '#d9a0a0', 0);
    circ(22.5, -1.2, 1.4, OL, 0);
    stroke([16, 2, 21, 1.5], OL, 0.9);
    ell(13.5, -5, 1.6, 1.8, '#f2c94c', 0.9);
    circ(14, -5, 0.7, OL, 0);
    stroke([11.5, -8, 16, -6.5], OL, 1.1);
  }

  function snake(f) {
    const seg = 11;
    const pts = [];
    for (let i = 0; i < seg; i++) {
      pts.push({ x: 13 - i * 3.3, y: 12 + Math.sin(f * TAU - i * 0.75) * 3.2, r: 4.6 - i * 0.28 });
    }
    for (let i = seg - 1; i >= 0; i--) {
      const p = pts[i];
      circ(p.x, p.y, p.r + 0.5, OL, 0);
    }
    for (let i = seg - 1; i >= 0; i--) {
      const p = pts[i];
      circ(p.x, p.y, p.r - 0.4, i % 3 === 1 ? '#c9b24a' : '#4f9a3a', 0);
    }
    const hy = pts[0].y - 1;
    stroke([21, hy + 1.2, 25, hy + 1.2, 27, hy - 0.5], '#e0303a', 0.8);
    stroke([25, hy + 1.2, 27, hy + 2.6], '#e0303a', 0.8);
    ell(17, hy, 6.5, 4.6, rad(17, hy, 6.5, '#5aaa42'), 1.6, 0.1);
    eye(19, hy - 1.4, 0.75, true, -1);
    circ(22.5, hy, 0.5, OL, 0);
  }

  function tiger(f) {
    const s = Math.sin(f * TAU);
    limb([-16, 2, -24, -2 + s * 2, -24, -10 + s], '#e58a2e', 2.6, true);
    stroke([-21.5, -1.6 + s, -23.8, -0.5 + s], OL, 1.2);
    stroke([-24, -6 + s, -26, -6 + s], OL, 1.2);
    legs4(f, [-10, 7, -6, 10], 9, 11, '#e0842a', 3.6);
    ell(-2, 4 + s * 0.5, 17, 9.5, lin(-18, -6, 14, 14, '#ec8e30'), 1.8);
    ell(-2, 9.5, 11, 3.6, 'rgba(255,248,235,.75)', 0);
    g.strokeStyle = OL;
    g.lineWidth = 1.5 * lwScale;
    for (const x of [-14, -9, -4, 1, 6]) {
      g.beginPath(); g.moveTo(x, -5 + s * 0.5); g.quadraticCurveTo(x + 2, -1, x - 0.5, 2); g.stroke();
    }
    circ(12, -1, 8.5, rad(12, -1, 8.5, '#f09535'), 1.8);
    circ(7, -8, 2.8, '#e58a2e', 1.3); circ(14, -9, 2.8, '#e58a2e', 1.3);
    circ(7, -8, 1.3, '#4a2a1a', 0); circ(14, -9, 1.3, '#4a2a1a', 0);
    ell(17, 2, 4.5, 3.4, '#fff8ea', 1.2);
    poly([18.5, -0.4, 21, -0.4, 19.8, 1.4], '#d0606a', 0.8);
    stroke([8, -6, 10, -4.5], OL, 1.1); stroke([12, -9.5, 12, -6.5], OL, 1.1);
    eye(15, -2.6, 0.8, true, -1);
  }

  function shark(f) {
    const s = Math.sin(f * TAU);
    g.save();
    g.rotate(s * 0.05);
    const tail = s * 3;
    poly([-17, 3, -27, -6 + tail, -24, 3, -27, 11 + tail], lin(-27, -6, -17, 11, '#5f7c96'), 1.6);
    poly([-3, -4, 5, -4, -6, -16], lin(-6, -16, 5, -4, '#5f7c96'), 1.6);
    g.beginPath();
    g.moveTo(24, 3);
    g.quadraticCurveTo(14, -7, -2, -6);
    g.quadraticCurveTo(-14, -5, -19, 3);
    g.quadraticCurveTo(-8, 11, 4, 11);
    g.quadraticCurveTo(18, 10, 24, 3);
    g.closePath();
    fs(lin(0, -7, 0, 11, '#7894ae'), 1.8);
    g.beginPath();
    g.moveTo(22, 5);
    g.quadraticCurveTo(10, 11, -6, 8);
    g.quadraticCurveTo(6, 6, 22, 5);
    g.closePath();
    fs('#eef2f5', 0);
    poly([2, 6, 9, 6, 0, 14], '#5f7c96', 1.4);
    for (const x of [10, 13, 16]) stroke([x, 3, x - 0.8, 6], 'rgba(30,40,55,.5)', 0.8);
    eye(15, -0.5, 0.75, true, -1);
    stroke([17, 5, 23, 4.2], OL, 1);
    g.fillStyle = '#fff';
    for (const x of [18, 20, 22]) { g.beginPath(); g.moveTo(x, 4.4); g.lineTo(x + 0.8, 6); g.lineTo(x + 1.5, 4.2); g.fill(); }
    g.restore();
    // 물결
    stroke([-20, 15, -12, 13.5, -4, 15], 'rgba(200,235,255,.7)', 1.4, true);
    stroke([4, 15, 12, 13.5, 20, 15], 'rgba(200,235,255,.7)', 1.4, true);
  }

  function octopus(f) {
    for (let i = 0; i < 6; i++) {
      const bx = -10 + i * 4;
      const w = Math.sin(f * TAU + i * 1.1) * 4;
      limb([bx, 4, bx + w * 0.5 - 2, 13, bx + w, 21], i % 2 ? '#9a4fa3' : '#a85ab0', 3.6, true);
    }
    g.fillStyle = '#f0c8f0';
    for (let i = 0; i < 6; i++) {
      const bx = -10 + i * 4 + Math.sin(f * TAU + i * 1.1) * 2;
      g.beginPath(); g.arc(bx, 14, 0.8, 0, TAU); g.fill();
    }
    g.beginPath();
    g.moveTo(-13, 6);
    g.quadraticCurveTo(-16, -18, 1, -18);
    g.quadraticCurveTo(17, -18, 14, 6);
    g.quadraticCurveTo(0, 10, -13, 6);
    g.closePath();
    fs(rad(1, -6, 15, '#b462bc'), 1.8);
    ell(-5, -11, 3, 2, 'rgba(255,255,255,.3)', 0, -0.5);
    g.fillStyle = 'rgba(90,30,100,.4)';
    for (const [x, y] of [[-6, -4], [8, -9], [10, -2], [-2, -13]]) { g.beginPath(); g.arc(x, y, 1.4, 0, TAU); g.fill(); }
    eye(7, -1, 1.1, true, -1);
    eye(0, -1, 1.1, true, 1);
    stroke([2, 4, 4, 3, 6, 4], OL, 1.1, true);
  }

  function horse(f, o = {}) {
    const s = Math.sin(f * TAU);
    const col = o.color || '#8a5a32';
    const mane = o.mane || '#2a1a10';
    limb([-17, -1, -24, 2 + s * 2, -25, 10 + s], mane, 3.2, true);
    legs4(f, [-12, 9, -8, 13], 6, 15, shade(col, -0.12), 3.2, '#2a1a10');
    ell(-1, 3 + s * 0.6, 17, 9, lin(-18, -6, 16, 12, col), 1.8);
    if (o.saddle) {
      rr(-8, -5.5 + s * 0.6, 12, 6, 2.5, o.saddle, 1.3);
      stroke([-2, 0, -2, 9], o.saddle, 1.2);
    }
    // 목과 머리
    g.beginPath();
    g.moveTo(8, -3);
    g.quadraticCurveTo(13, -14, 18, -17);
    g.lineTo(22, -12);
    g.quadraticCurveTo(18, -4, 15, 4);
    g.closePath();
    fs(lin(8, -17, 22, 4, col), 1.6);
    ell(22, -12.5, 7.5, 4.2, lin(15, -17, 29, -8, col), 1.6, 0.5);
    poly([17, -18, 18.5, -23, 20.5, -17.5], col, 1.3);
    limb([16, -18, 12, -12, 9, -5], mane, 2.4, true);
    circ(26.5, -9.5, 0.7, OL, 0);
    eye(21, -14.5, 0.7, !!o.angry, -1);
    if (o.bridle) stroke([18, -11, 26, -8], o.bridle, 1);
  }

  function rider(f, o) {
    horse(f, o.horse);
    g.save();
    g.translate(-1, -15);
    g.scale(0.88, 0.88);
    humanoid(f * 0.5, { ...o, legs: false });
    g.restore();
    // 말 옆구리 위로 보이는 다리
    limb([-1, -1, 1, 6, -1, 10], o.pants || '#3a2a20', 3.4, true);
    ell(0, 11, 3, 1.8, '#2a1a10', 1.2);
  }

  function eagle(f) {
    const flap = Math.sin(f * TAU);
    const wy = flap * 11;
    const wing = (dx, dy, dark) => {
      g.beginPath();
      g.moveTo(-3 + dx, -1 + dy * 0.1);
      g.quadraticCurveTo(-10 + dx, -10 + wy * 0.5 + dy, -22 + dx, -12 + wy + dy);
      g.quadraticCurveTo(-18 + dx, -4 + wy * 0.6 + dy, -17 + dx, -1 + wy * 0.3 + dy);
      g.quadraticCurveTo(-11 + dx, 2 + dy, -3 + dx, 4 + dy);
      g.closePath();
      fs(lin(-22, -12, -3, 4, dark ? '#5a3a20' : '#7a5230'), 1.5);
      if (!dark) {
        for (let i = 0; i < 3; i++) stroke([-15 - i * 2.5 + dx, -4 + wy * 0.55 + dy, -18 - i * 2 + dx, -6 + wy * 0.8 + dy], 'rgba(40,25,10,.5)', 0.8);
      }
    };
    wing(4, -3, true);
    poly([-12, 2, -20, 5, -19, 9, -11, 6], '#6a4426', 1.4);
    ell(-2, 2, 11, 6.5, lin(-12, -4, 9, 8, '#7a5230'), 1.7);
    circ(9, -4, 5.6, rad(9, -4, 5.6, '#f1e6cc'), 1.6);
    poly([13, -5.5, 18.5, -3.5, 14.5, -1, 13, -2], '#f2b630', 1.3);
    eye(10.8, -5, 0.7, true, -1);
    stroke([0, 8, 1, 11], '#f2b630', 1.4);
    stroke([4, 8, 5, 11], '#f2b630', 1.4);
    wing(0, 0, false);
  }

  function mammoth(f) {
    const s = Math.sin(f * TAU);
    limb([-19, -2, -24, 4, -23, 9], '#5a3a22', 2.2, true);
    legs4(f, [-13, 6, -8, 11], 7, 13, '#5f3f25', 6.2, '#3a2414');
    g.beginPath();
    g.moveTo(-21, 6);
    g.quadraticCurveTo(-24, -14, -6, -16);
    g.quadraticCurveTo(10, -18, 14, -6);
    g.quadraticCurveTo(14, 10, 4, 12);
    g.quadraticCurveTo(-12, 15, -21, 6);
    g.closePath();
    fs(lin(-22, -16, 14, 14, '#86593a'), 1.9);
    g.strokeStyle = 'rgba(50,30,15,.45)';
    g.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const x = -18 + i * 3.6;
      g.beginPath(); g.moveTo(x, 4 + (i % 3)); g.quadraticCurveTo(x - 1, 9, x + 0.5, 12); g.stroke();
    }
    // 머리
    circ(13, -7, 10.5, rad(13, -7, 10.5, '#8e603e'), 1.8);
    ell(13, -18, 6, 3.5, '#7a5233', 1.4, 0.2);            // 정수리 혹
    // 코
    limb([19, -2, 25, 6 + s * 1.5, 22, 15 + s * 2], '#86593a', 5.4, true);
    // 상아
    g.beginPath();
    g.moveTo(16, 1);
    g.quadraticCurveTo(26, 9, 31, -2);
    g.quadraticCurveTo(27, 5, 17, 4);
    g.closePath();
    fs(lin(16, -2, 31, 8, '#f6eedb'), 1.5);
    ell(7, -6, 5, 7, lin(2, -13, 12, 1, '#6e4a2e'), 1.5, 0.2);   // 귀
    eye(17.5, -9, 0.9, true, -1);
  }

  function ship(f, o = {}) {
    const s = Math.sin(f * TAU);
    g.save();
    g.translate(0, s * 1.2);
    g.rotate(s * 0.03);
    // 돛대와 돛
    const masts = o.masts || [0];
    for (const mx of masts) {
      rr(mx - 1.3, -30, 2.6, 34, 1, '#6a4426', 1.2);
      g.beginPath();
      g.moveTo(mx - 13, -27);
      g.quadraticCurveTo(mx + 2 + s, -17, mx - 13, -4);
      g.lineTo(mx + 11, -4);
      g.quadraticCurveTo(mx + 15 + s, -16, mx + 11, -27);
      g.closePath();
      fs(lin(mx - 13, -27, mx + 11, -4, o.sail || '#efe4c8'), 1.5);
      if (o.stripes) {
        g.strokeStyle = o.stripes;
        g.lineWidth = 1.6;
        for (const y of [-21, -15, -9]) { g.beginPath(); g.moveTo(mx - 11, y); g.lineTo(mx + 11.5, y); g.stroke(); }
      }
      if (o.skull) {
        circ(mx, -17, 3.4, '#f2efe6', 1);
        circ(mx - 1.2, -17.5, 0.8, OL, 0); circ(mx + 1.2, -17.5, 0.8, OL, 0);
        stroke([mx - 4, -12, mx + 4, -10], '#f2efe6', 1.2);
        stroke([mx + 4, -12, mx - 4, -10], '#f2efe6', 1.2);
      }
      const fw = Math.sin(f * TAU * 2) * 1.2;
      poly([mx, -33, mx - 9, -31 + fw, mx, -28], o.flag || '#c8302a', 1.1);
    }
    if (o.steam) {
      rr(-4, -26, 8, 26, 1.5, lin(-4, 0, 4, 0, '#2a2a30', 0.3, -0.2), 1.5);
      rr(-4.5, -22, 9, 3, 1, '#b8322a', 1.1);
      for (let i = 0; i < 3; i++) {
        const t = (f + i / 3) % 1;
        circ(-2 - t * 10, -30 - t * 10, 3 + t * 4, `rgba(200,200,200,${0.8 - t * 0.6})`, 0);
      }
    }
    // 선체
    g.beginPath();
    g.moveTo(-28, 1);
    g.lineTo(28, -1);
    g.quadraticCurveTo(25, 13, 15, 15);
    g.lineTo(-18, 15);
    g.quadraticCurveTo(-26, 12, -28, 1);
    g.closePath();
    fs(lin(0, -1, 0, 15, o.hull || '#7a4e2a'), 1.9);
    g.strokeStyle = 'rgba(40,20,5,.5)';
    g.lineWidth = 0.9;
    for (const y of [5, 9]) { g.beginPath(); g.moveTo(-25, y); g.lineTo(25, y - 1); g.stroke(); }
    rr(-28, -1.5, 56, 3, 1.4, shade(o.hull || '#7a4e2a', 0.2), 1.3);
    g.fillStyle = 'rgba(20,10,0,.55)';
    for (const x of [-15, -5, 5, 15]) { g.beginPath(); g.arc(x, 6.5, 1.4, 0, TAU); g.fill(); }
    g.restore();
    // 물결
    for (const [x, d] of [[-26, 0], [-8, 1], [10, 0.5]]) {
      stroke([x, 17 + d, x + 7, 14.5 + d, x + 14, 17 + d], 'rgba(210,240,255,.8)', 1.6, true);
    }
  }

  function chest(f) {
    const s = Math.sin(f * TAU);
    rr(-15, -4, 30, 17, 3, lin(-15, -4, 15, 13, '#9a5f2c'), 1.8);
    g.beginPath();
    g.moveTo(-16, -3);
    g.quadraticCurveTo(-16, -15, 0, -15);
    g.quadraticCurveTo(16, -15, 16, -3);
    g.closePath();
    fs(lin(0, -15, 0, -3, '#b06e34'), 1.8);
    for (const x of [-9, 9]) {
      rr(x - 1.8, -14, 3.6, 27, 1, lin(0, -14, 0, 13, '#e2bb52'), 1.1);
    }
    rr(-4, -6, 8, 8, 2, '#f0cb5a', 1.3);
    circ(0, -2, 1.2, OL, 0);
    // 반짝임
    g.fillStyle = `rgba(255,250,210,${0.55 + s * 0.35})`;
    const star = (x, y, r) => {
      g.beginPath();
      g.moveTo(x, y - r); g.lineTo(x + r * 0.25, y - r * 0.25); g.lineTo(x + r, y); g.lineTo(x + r * 0.25, y + r * 0.25);
      g.lineTo(x, y + r); g.lineTo(x - r * 0.25, y + r * 0.25); g.lineTo(x - r, y); g.lineTo(x - r * 0.25, y - r * 0.25);
      g.closePath(); g.fill();
    };
    star(13, -15, 3.5 + s); star(-14, -10, 2.4 - s * 0.6);
  }

  function mirror(f) {
    circ(0, 0, 11, rad(0, 0, 11, '#c9984a'), 1.8);
    g.strokeStyle = 'rgba(90,50,10,.55)';
    g.lineWidth = 0.7;
    g.beginPath(); g.arc(0, 0, 8.6, 0, TAU); g.stroke();
    g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.stroke();
    // 다뉴세문경처럼 가는 선 무늬
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU;
      g.beginPath();
      g.moveTo(Math.cos(a) * 5.2, Math.sin(a) * 5.2);
      g.lineTo(Math.cos(a + 0.2) * 8.4, Math.sin(a + 0.2) * 8.4);
      g.stroke();
    }
    circ(-1.6, 0, 1.4, '#a8782e', 0.9);
    circ(1.6, 0, 1.4, '#a8782e', 0.9);
    const k = (Math.sin(f * TAU) + 1) / 2;
    g.fillStyle = `rgba(255,255,230,${0.25 + k * 0.4})`;
    g.beginPath(); g.ellipse(-4, -4.5, 3.4, 1.5, -0.7, 0, TAU); g.fill();
  }

  // ── 바닥 장식 / 곡옥 ──────────────────────────────────
  function dolmen() {
    ell(0, 14, 24, 5, 'rgba(0,0,0,.25)', 0);
    rr(-15, -2, 7, 16, 2, lin(-15, -2, -8, 14, '#8f8f96'), 1.6);
    rr(8, -2, 7, 16, 2, lin(8, -2, 15, 14, '#86868d'), 1.6);
    rr(-3, 0, 6, 13, 2, lin(-3, 0, 3, 13, '#6f6f76'), 1.4);
    poly([-22, -4, -16, -12, 18, -13, 23, -5, 18, 1, -18, 2], lin(-22, -13, 23, 2, '#a7a7ad', 0.25, -0.25), 1.8);
    stroke([-14, -8, 12, -9], 'rgba(255,255,255,.35)', 1.2);
    g.fillStyle = 'rgba(80,110,60,.6)';
    for (const [x, y] of [[-12, -5], [6, -3], [15, -7]]) { g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill(); }
  }
  function rock() {
    g.beginPath();
    g.moveTo(-10, 6); g.quadraticCurveTo(-12, -4, -4, -7); g.quadraticCurveTo(5, -10, 10, -2); g.quadraticCurveTo(13, 6, 6, 7); g.closePath();
    fs(lin(-10, -9, 10, 7, '#9a958a', 0.25, -0.3), 1.6);
    stroke([-5, -4, 2, -6], 'rgba(255,255,255,.4)', 1.2);
  }
  function grass(f, col = '#5f9a3a') {
    for (const [x, h, a] of [[-5, 10, -0.4], [0, 13, 0], [5, 10, 0.4]]) {
      g.save(); g.translate(x, 6); g.rotate(a);
      poly([-2.6, 0, 2.6, 0, 0.3, -h], lin(0, -h, 0, 0, col, 0.3, -0.1), 1.2);
      g.restore();
    }
  }
  function flowers() {
    grass(0, '#5f9a3a');
    for (const [x, y, c] of [[-4, -4, '#f2d24a'], [3, -6, '#f08aa0'], [0, -1, '#ffffff']]) circ(x, y, 1.8, c, 1);
  }
  function tree(f, col = '#4f8a3a') {
    ell(0, 15, 13, 3.5, 'rgba(0,0,0,.25)', 0);
    rr(-2.5, 2, 5, 13, 1.5, lin(-2.5, 0, 2.5, 0, '#7a5230'), 1.4);
    circ(-6, -2, 7, rad(-6, -2, 7, shade(col, -0.08)), 1.6);
    circ(6, -2, 7, rad(6, -2, 7, shade(col, -0.05)), 1.6);
    circ(0, -8, 8.5, rad(0, -8, 8.5, col), 1.6);
  }
  function pine(f) {
    ell(0, 15, 11, 3, 'rgba(0,0,0,.25)', 0);
    rr(-2, 6, 4, 9, 1, '#6a4426', 1.3);
    for (const [y, w] of [[8, 11], [0, 9], [-8, 6.5]]) poly([-w, y, w, y, 0, y - 11], lin(-w, y - 11, w, y, '#3f7a4a'), 1.5);
  }
  function lotus() {
    ell(0, 2, 11, 5, lin(-11, -3, 11, 7, '#4f9a6a'), 1.5);
    poly([0, 2, 6, -1, 9, 3], 'rgba(0,0,0,.25)', 0);
    for (const a of [-0.6, 0, 0.6]) { g.save(); g.translate(-2, -1); g.rotate(a); ell(0, -4, 2, 4.5, lin(0, -9, 0, 0, '#f4a6c0'), 1.2); g.restore(); }
  }
  function gogok(f, col) {
    // 곡옥: 둥근 머리 + 휘어진 꼬리, 머리에 구멍
    g.beginPath();
    g.arc(-1, -3, 6, Math.PI * 0.55, Math.PI * 2.25);
    g.quadraticCurveTo(7, 6, -3, 10);
    g.quadraticCurveTo(1, 5, -4, 2.6);
    g.closePath();
    fs(lin(-7, -9, 6, 10, col, 0.35, -0.25), 1.5);
    circ(-1.3, -3.6, 1.7, OL, 0);
    ell(-3.6, -6.2, 1.6, 1, 'rgba(255,255,255,.75)', 0, -0.6);
  }

  function chongtong() {
    g.save();
    g.rotate(-0.25);
    limb([-20, 2, -10, 0], '#7a5230', 3.2);                        // 자루
    rr(-11, -4, 26, 8, 3, lin(0, -4, 0, 4, '#a8833e', 0.3, -0.3), 1.6);   // 통
    for (const x of [-7, 0, 7]) rr(x - 1.2, -4.8, 2.4, 9.6, 1, lin(0, -5, 0, 5, '#c9a24f'), 1.1);
    rr(13, -5, 4, 10, 1.5, lin(0, -5, 0, 5, '#8a6a30'), 1.4);       // 총구
    circ(-4, -5.5, 1.2, '#c8302a', 1);                               // 심지
    g.restore();
  }

  function songpyeon() {
    ell(0, 6, 14, 4.5, lin(-14, 2, 14, 10, '#d9d2c2'), 1.5);                 // 접시
    for (const [x, y, c] of [[-6, 2, '#f4f0e6'], [5, 2, '#f2a7b8'], [0, -3, '#9cc97a']]) {
      g.beginPath();
      g.arc(x, y, 5.5, Math.PI, 0);
      g.quadraticCurveTo(x + 5.5, y + 3, x, y + 3);
      g.quadraticCurveTo(x - 5.5, y + 3, x - 5.5, y);
      g.closePath();
      fs(lin(x, y - 6, x, y + 3, c, 0.3, -0.15), 1.4);
    }
  }
  function magnet() {
    g.save();
    g.rotate(-0.5);
    g.beginPath();
    g.arc(0, 0, 9, Math.PI, 0);
    g.lineTo(9, 9); g.lineTo(4, 9); g.lineTo(4, 0);
    g.arc(0, 0, 4, 0, Math.PI, true);
    g.lineTo(-4, 9); g.lineTo(-9, 9);
    g.closePath();
    fs(lin(-9, -9, 9, 9, '#d8433a'), 1.6);
    rr(-9, 6, 5, 4, 1, '#dfe4ea', 1.3);
    rr(4, 6, 5, 4, 1, '#dfe4ea', 1.3);
    g.restore();
  }

  // ── 강화 아이콘 ──────────────────────────────────────
  const icons = {
    bow() {
      limb([-6, -16, 12, -4, -6, 16], '#8a5a2b', 3, true);
      stroke([-6, -16, -6, 16], '#efe4c8', 1);
      g.save(); g.rotate(-0.75);
      stroke([-14, 0, 13, 0], '#d9c48a', 1.6);
      poly([13, -2.6, 18, 0, 13, 2.6], '#cfd6de', 1.1);
      poly([-14, 0, -17, -3, -12, -1.5], '#c8302a', 0.9); poly([-14, 0, -17, 3, -12, 1.5], '#c8302a', 0.9);
      g.restore();
    },
    bipa() {
      g.save(); g.rotate(-0.8);
      poly([-4, -2, 4, -4.5, 8, -2.2, 12, -4, 20, 0, 12, 4, 8, 2.2, 4, 4.5, -4, 2], lin(0, -4, 0, 4, '#d9a54e', 0.35, -0.2), 1.4);
      stroke([-2, 0, 18, 0], 'rgba(120,70,20,.7)', 0.9);
      rr(-14, -2.2, 10, 4.4, 1.5, '#5a3220', 1.3);
      rr(-5, -4, 2.6, 8, 1, '#c99a4a', 1.1);
      g.restore();
    },
    bell() {
      ell(0, -15, 3.5, 3, '#8a6a30', 1.4);
      g.beginPath();
      g.moveTo(-8, -12); g.quadraticCurveTo(-10, 0, -14, 12); g.lineTo(14, 12); g.quadraticCurveTo(10, 0, 8, -12); g.closePath();
      fs(lin(-14, -12, 14, 12, '#7a9a7a', 0.3, -0.3), 1.6);         // 청록빛 동종
      rr(-15, 10, 30, 4, 2, lin(0, 10, 0, 14, '#6a8a6a'), 1.3);
      circ(-5, 1, 2.6, '#c9b26a', 1.1);                                // 당좌
      stroke([-8, -6, 8, -6], 'rgba(30,50,30,.6)', 1);
    },
    rocket() {
      g.save(); g.rotate(-0.8);
      stroke([-16, 0, 16, 0], '#c9a86a', 1.8);
      rr(4, -3.2, 10, 6.4, 1.5, lin(0, -3, 0, 3, '#b8322a'), 1.3);     // 약통
      poly([16, -2.4, 20, 0, 16, 2.4], '#cfd6de', 1);
      poly([-16, 0, -19, -3.5, -13, -1.5], '#efe4c8', 0.9); poly([-16, 0, -19, 3.5, -13, 1.5], '#efe4c8', 0.9);
      poly([4, -2, -4, 0, 4, 2], '#ffb52e', 0);
      poly([2, -1, -8, 0, 2, 1], '#ffe066', 0);
      g.restore();
    },
    shoes() {
      for (const [x, r] of [[-6, -0.25], [6, 0.25]]) {
        ell(x, 2, 6, 13, lin(x - 6, -11, x + 6, 15, '#d8b86a', 0.25, -0.2), 1.5, r);
        g.save(); g.translate(x, 2); g.rotate(r);
        for (const y of [-7, -2, 3, 8]) stroke([-4, y, 4, y], 'rgba(120,85,30,.7)', 0.9);
        stroke([-4, -9, 0, -3, 4, -9], '#8a5a2b', 1.4);
        g.restore();
      }
    },
    armor() {
      g.beginPath();
      g.moveTo(-12, -14); g.lineTo(-5, -16); g.quadraticCurveTo(0, -10, 5, -16); g.lineTo(12, -14);
      g.lineTo(13, 14); g.lineTo(-13, 14); g.closePath();
      fs(lin(-13, -16, 13, 14, '#9a6a3a'), 1.6);
      g.strokeStyle = 'rgba(50,25,10,.6)'; g.lineWidth = 0.9;
      for (let row = 0; row < 5; row++) for (let col = -3; col <= 3; col++) {
        g.beginPath(); g.arc(col * 3.6 + (row % 2) * 1.8, -8 + row * 4.6, 1.8, 0, Math.PI); g.stroke();
      }
      rr(-13, 3, 26, 3.4, 1.4, '#c8302a', 1.2);
    },
    jige() {
      limb([-9, 16, -6, -16], '#8a5a2b', 3);
      limb([9, 16, 6, -16], '#8a5a2b', 3);
      for (const y of [-10, -2, 6]) limb([-7.5, y, 7.5, y], '#a8743a', 2.2);
      limb([-8, 2, -15, 6], '#8a5a2b', 2.4);
      rr(-8, -16, 16, 9, 2, lin(0, -16, 0, -7, '#c99a5a'), 1.3);         // 짐
      stroke([-4, -14, 4, -9], 'rgba(90,60,20,.6)', 0.9);
    },
    scroll() {
      rr(-12, -10, 24, 20, 1, lin(0, -10, 0, 10, '#f3ead2', 0.2, -0.15), 1.4);
      for (const y of [-5, -1, 3]) stroke([-7, y, 7, y], '#7a6a55', 1);
      rr(-15, -12, 4, 24, 1.5, lin(-15, 0, -11, 0, '#8a5a2b'), 1.3);
      rr(11, -12, 4, 24, 1.5, lin(11, 0, 15, 0, '#8a5a2b'), 1.3);
    },
    ginseng() {
      for (const a of [-0.5, 0, 0.5]) {
        g.save(); g.translate(0, -8); g.rotate(a);
        ell(0, -6, 2.4, 5.5, lin(0, -12, 0, 0, '#4f9a3a'), 1.1);
        g.restore();
      }
      circ(0, -15, 1.8, '#d8433a', 0.9);
      g.beginPath();
      g.moveTo(-3, -6); g.quadraticCurveTo(-5, 4, -9, 14); g.lineTo(-5, 13); g.quadraticCurveTo(0, 6, 3, 15);
      g.lineTo(6, 13); g.quadraticCurveTo(4, 2, 3, -6); g.closePath();
      fs(lin(-9, -6, 6, 15, '#efd7a8', 0.25, -0.2), 1.5);
      stroke([-2, 0, 2, 1], 'rgba(150,100,50,.6)', 0.8);
      stroke([-3, 5, 1, 6], 'rgba(150,100,50,.6)', 0.8);
    },
    powder() {
      ell(0, 12, 12, 3.5, 'rgba(0,0,0,.2)', 0);
      rr(-11, -10, 22, 22, 6, lin(-11, -10, 11, 12, '#8a5a2b'), 1.6);
      for (const y of [-5, 6]) rr(-12, y - 1.6, 24, 3.2, 1.2, '#4a4a52', 1.1);
      rr(-5, -2, 10, 6, 1, '#efe4c8', 1);
      stroke([0, -10, 3, -15, 6, -14], '#3a2a20', 1.4, true);
      circ(6.5, -14.5, 2.4, '#ffb52e', 0); circ(6.5, -14.5, 1.1, '#fff2a0', 0);
    },
    sundial() {
      limb([-9, 6, -12, 16], '#5a4a3a', 2.4); limb([9, 6, 12, 16], '#5a4a3a', 2.4); limb([0, 8, 0, 16], '#5a4a3a', 2.4);
      g.beginPath();
      g.moveTo(-15, -4); g.quadraticCurveTo(0, 18, 15, -4); g.closePath();
      fs(lin(-15, -4, 15, 10, '#a8833e', 0.25, -0.25), 1.6);             // 솥 모양 몸체
      ell(0, -4, 15, 4, lin(0, -8, 0, 0, '#efe4c8'), 1.4);                 // 시반면
      for (let i = -3; i <= 3; i++) stroke([i * 3.6, -6.5, i * 3.6, -1.5], 'rgba(90,60,20,.6)', 0.7);
      stroke([-12, -4, 6, -13], '#3a2a20', 1.4);                           // 영침
    },
  };

  // ── 스프라이트 정의 ───────────────────────────────────
  const H = (o, extra = {}) => ({ draw: f => humanoid(f, o), ...extra });
  const DEFS = {
    // 플레이어 영웅
    dangun: H({ robe: '#efe9da', trim: '#b9a888', pants: '#e2dccb', shoe: '#6a4a2a', hat: 'topknot', band: '#8a5a2b', hair: '#f4f1ea', beard: true, weapon: 'staff', belt: '#8a5a2b', beltKnot: true }),
    dol: H({ skin: '#e6b384', robe: '#8b6a45', dots: 'rgba(60,40,20,.55)', pants: '#e6b384', shoe: '#6a4a2a', hat: 'messy', hair: '#3b2a1e', weapon: 'handaxe', belt: '#5a3a1e', trim: '#c9a87a' }),
    jumong: H({ robe: '#c2412d', dots: '#f3ead2', pants: '#e8d6a8', hat: 'feather', hatColor: '#6b2f22', weapon: 'bow', belt: '#2b1d14', beltKnot: true, trim: '#2b1d14' }),
    yusin: H({ robe: '#2d6e8c', pants: '#e9e0c8', hat: 'topknot', band: '#d8b04a', weapon: 'bipa', belt: '#d8b04a', beltKnot: true, trim: '#f3ecd9' }),
    sejong: H({ robe: '#b8282c', emblem: true, pants: '#7a1a1e', hat: 'royal', beard: true, weapon: 'book', belt: '#e2bb52', trim: '#f3ecd9' }),
    sunsin: H({ robe: '#7a2a22', armor: true, armorColor: '#9a6a3a', pants: '#3a2a22', hat: 'helmet', hatColor: '#4a4a55', mustache: true, beard: true, weapon: 'bigsword', cape: '#a82a24', belt: '#2a1a12' }),

    // 선사
    rat: { draw: rat },
    boar: { draw: boar },
    wolf: { draw: wolf },
    mammoth: { draw: mammoth },
    // 고조선
    snake: { draw: snake, shadowY: 15 },
    tiger: { draw: tiger },
    han_soldier: H({ robe: '#7a3b2a', armor: true, armorColor: '#8a5a3a', hat: 'conical', hatColor: '#5a3a26', weapon: 'spear', angry: true }),
    han_general: H({ robe: '#5a2a1e', armor: true, armorColor: '#b08a3a', hat: 'plume', hatColor: '#6a4a2a', beard: true, weapon: 'sword', cape: '#8a1e1a', angry: true }),
    // 삼국
    sui_scout: H({ robe: '#34343f', hat: 'hood', hatColor: '#2a2a33', mask: true, weapon: 'dagger', angry: true, belt: '#8a2a2a' }),
    sui_infantry: H({ robe: '#8a6a24', armor: true, armorColor: '#a08a5a', hat: 'conical', hatColor: '#6a6a70', weapon: 'spear', angry: true }),
    tang_rider: { draw: f => rider(f, { robe: '#b08a2a', armor: true, armorColor: '#c8a050', hat: 'plume', hatColor: '#7a6a50', weapon: 'spear', angry: true, horse: { color: '#c8b8a0', saddle: '#8a2a24', angry: true } }) },
    tang_guard: H({ robe: '#9a6a1a', armor: true, armorColor: '#d8aa3a', hat: 'plume', hatColor: '#8a6a2a', plume: '#e8c040', beard: true, weapon: 'halberd', cape: '#6a1a5a', angry: true }),
    // 남북국
    pirate: H({ robe: '#3e4f66', hat: 'bandana', hatColor: '#b8322a', weapon: 'saber', angry: true, mustache: true, belt: '#6a4426', trim: '#d8d0b8' }),
    shark: { draw: shark, shadowY: 17 },
    octopus: { draw: octopus },
    pirate_ship: { draw: f => ship(f, { sail: '#3a3a40', skull: true, hull: '#4a3020', flag: '#2a2a2a', masts: [-8, 10] }), shadowY: 17, mul: 0.95 },
    // 고려
    khitan_rider: { draw: f => rider(f, { robe: '#5a7a4a', hat: 'fur', hatColor: '#5a3a26', weapon: 'spear', angry: true, horse: { color: '#5a3a26', saddle: '#c8a050', angry: true } }) },
    mongol_horse: { draw: f => horse(f, { color: '#a0703a', saddle: '#b8322a', bridle: '#d8b04a', angry: true }) },
    eagle: { draw: eagle, fly: true },
    mongol_chief: H({ robe: '#2f4f80', armor: true, armorColor: '#8a6a4a', hat: 'fur', hatColor: '#4a2a1a', fur: '#e0cfa0', beard: true, weapon: 'saber', cape: '#6a1a1a', angry: true }),
    // 조선
    wae_scout: H({ robe: '#4a4038', hat: 'jingasa', hatColor: '#3a3a3a', weapon: 'sword', angry: true, belt: '#8a2a2a' }),
    wae_gunner: H({ robe: '#5a3a3a', armor: true, armorColor: '#4a4a52', hat: 'jingasa', hatColor: '#2a2a2a', weapon: 'gun', angry: true }),
    wae_ship: { draw: f => ship(f, { sail: '#e8dcc0', stripes: 'rgba(60,60,60,.55)', hull: '#6a4a2a', flag: '#e8e0d0' }), shadowY: 17, mul: 0.95 },
    wae_fleet: { draw: f => ship(f, { sail: '#e8dcc0', stripes: 'rgba(60,60,60,.55)', hull: '#5a3a22', flag: '#e8e0d0', masts: [-11, 0, 11] }), shadowY: 17, mul: 0.95 },

    // 바닥 장식
    dolmen: { draw: dolmen, still: true },
    rock: { draw: rock, still: true },
    grass: { draw: f => grass(f), still: true },
    grass_dry: { draw: f => grass(f, '#a8964a'), still: true },
    flowers: { draw: flowers, still: true },
    tree: { draw: f => tree(f), still: true },
    tree_autumn: { draw: f => tree(f, '#c9783a'), still: true },
    pine: { draw: pine, still: true },
    lotus: { draw: lotus, still: true },
    // 경험치 곡옥
    gogok_b: { draw: f => gogok(f, '#4aa8ff'), still: true },
    gogok_g: { draw: f => gogok(f, '#3fc46e'), still: true },
    gogok_r: { draw: f => gogok(f, '#ef4f4f'), still: true },

    // 조선 후기·개항기 (병인양요·신미양요)
    french_soldier: H({ robe: '#2f4f9a', pants: '#b8322a', shoe: '#2a2420', hat: 'kepi', hatColor: '#b8322a', band: '#2f4f9a', weapon: 'rifle', mustache: true, angry: true, belt: '#e8e0d0', straps: '#e8e0d0', trim: '#2f4f9a' }),
    us_marine: H({ robe: '#26304a', pants: '#7f96b8', shoe: '#2a2420', hat: 'kepi', hatColor: '#26304a', band: '#26304a', weapon: 'rifle', beard: true, hair: '#6a4a2a', angry: true, belt: '#e8e0d0', straps: '#e8e0d0', trim: '#26304a' }),
    west_boat: { draw: f => ship(f, { sail: '#ecebe4', hull: '#3a3a42', flag: '#2f4f9a' }), shadowY: 17, mul: 0.95 },
    steamship: { draw: f => ship(f, { sail: '#d8d8d0', hull: '#25252c', flag: '#e8e8e8', masts: [-15, 15], steam: true }), shadowY: 17, mul: 0.95 },
    // 일제 강점기
    jp_soldier: H({ robe: '#86804e', pants: '#76703e', shoe: '#2a2420', hat: 'cap', hatColor: '#7a7444', weapon: 'rifle', angry: true, belt: '#3a2a1a', straps: '#5a4a2a', trim: '#86804e' }),
    jp_mp: H({ robe: '#76703e', pants: '#2a2a2a', shoe: '#1a1a1a', hat: 'cap', hatColor: '#6a6436', band: '#8a2a24', armband: '#f0ece0', weapon: 'saber', mustache: true, angry: true, belt: '#2a1a12', trim: '#76703e' }),
    jp_rider: { draw: f => rider(f, { robe: '#86804e', hat: 'cap', hatColor: '#7a7444', weapon: 'saber', angry: true, pants: '#76703e', trim: '#86804e', horse: { color: '#6a4a2a', saddle: '#4a3a22', angry: true } }) },
    jp_officer: H({ robe: '#6f683a', pants: '#5f5a32', shoe: '#1a1a1a', hat: 'cap', hatColor: '#5f5a32', band: '#8a2a24', weapon: 'saber', mustache: true, angry: true, cape: '#3a3a2a', belt: '#2a1a12', straps: '#3a2a1a', trim: '#6f683a' }),

    // 무기/아이템
    chongtong: { draw: chongtong, still: true },
    ...Object.fromEntries(Object.entries(icons).map(([k, fn]) => ['ic_' + k, { draw: fn, still: true }])),
    songpyeon: { draw: songpyeon, still: true },
    magnet: { draw: magnet, still: true },
    handaxe: { draw: () => handaxeShape(0, 0, 1), still: true },
    mirror: { draw: mirror },
    chest: { draw: chest },
  };

  // ── 픽셀 아트 렌더러 ─────────────────────────────────
  // 벡터 그림을 4배로 크게 그린 뒤 화소 격자에 맞춰 줄이고(덮인 비율이 절반 이상인 칸만 채움),
  // 색을 몇 단계로 묶은 다음 실루엣 바깥에 1화소 외곽선을 두른다. 화면에서는 최근접 보간으로 키운다.
  const PIX = 2;                        // 화면 픽셀 / 아트 픽셀
  const SS = 4;                         // 슈퍼샘플링 배율
  const OLRGB = [36, 22, 13];
  let hiCanvas = null;

  function pixelize(draw, artScale, flash) {
    const N = Math.ceil(BOX * 2 * artScale) + 2;
    const W = N * SS;
    if (!hiCanvas || hiCanvas.width < W) {
      hiCanvas = document.createElement('canvas');
      hiCanvas.width = hiCanvas.height = Math.max(W, 256);
    }
    g = hiCanvas.getContext('2d', { willReadFrequently: true });
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    g.translate(W / 2, W / 2);
    g.scale(artScale * SS, artScale * SS);
    // 안쪽 선이 대략 1화소 두께가 되도록 맞춘다
    lwScale = Math.min(2.2, 0.62 / artScale);
    draw();
    g.setTransform(1, 0, 0, 1, 0, 0);
    const src = g.getImageData(0, 0, W, W).data;
    g = null;

    const out = document.createElement('canvas');
    out.width = out.height = N;
    const oc = out.getContext('2d');
    const img = oc.createImageData(N, N);
    const d = img.data;
    const solid = new Uint8Array(N * N);
    const lum = new Float32Array(N * N);
    const qz = v => Math.min(255, Math.round(v / 12) * 12);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let r = 0, gg = 0, b = 0, a = 0;
        for (let sy = 0; sy < SS; sy++) {
          let i = ((y * SS + sy) * W + x * SS) * 4;
          for (let sx = 0; sx < SS; sx++, i += 4) {
            const al = src[i + 3];
            r += src[i] * al; gg += src[i + 1] * al; b += src[i + 2] * al; a += al;
          }
        }
        if (a < SS * SS * 255 * 0.42) continue;
        const k = y * N + x, o = k * 4;
        let R = r / a, Gc = gg / a, B = b / a;
        if (flash) { R += (255 - R) * 0.75; Gc += (255 - Gc) * 0.75; B += (255 - B) * 0.75; }
        d[o] = qz(R); d[o + 1] = qz(Gc); d[o + 2] = qz(B); d[o + 3] = 255;
        solid[k] = 1;
        lum[k] = 0.3 * R + 0.59 * Gc + 0.11 * B;
      }
    }
    // 바깥 외곽선: 투명한 칸 옆에 밝은 칸이 있으면 외곽선 색으로 채운다(이미 어두운 가장자리는 그대로)
    const olc = flash ? [255, 255, 255] : OLRGB;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const k = y * N + x;
        if (solid[k]) continue;
        let need = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const nk = ny * N + nx;
          if (solid[nk] && lum[nk] > 72) { need = true; break; }
        }
        if (need) { const o = k * 4; d[o] = olc[0]; d[o + 1] = olc[1]; d[o + 2] = olc[2]; d[o + 3] = 255; }
      }
    }
    oc.putImageData(img, 0, 0);
    return out;
  }

  const cache = new Map();
  function render(key, scale, frame, flash) {
    const ck = `${key}|${scale}|${frame}|${flash ? 1 : 0}`;
    let c = cache.get(ck);
    if (c) return c;
    const def = DEFS[key];
    c = pixelize(() => def.draw(def.still ? 0 : frame / FRAMES), scale / PIX, flash);
    c.logical = c.width * PIX;
    cache.set(ck, c);
    return c;
  }

  // 투명 여백을 뺀 실제 그림 영역 [x, y, w, h]
  function bboxOf(c) {
    if (c.bbox) return c.bbox;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    c.bbox = x1 < 0 ? [0, 0, c.width, c.height] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
    return c.bbox;
  }

  // 같은 스프라이트라도 크기가 조금씩 다르면 캐시가 늘어나므로 배율을 0.05 단위로 맞춘다
  const q = v => Math.max(0.2, Math.round(v * 20) / 20);

  window.Sprites = {
    FRAMES,
    has: key => !!DEFS[key],
    info: key => DEFS[key] || {},
    // phase: 0~1 반복되는 애니메이션 진행도
    draw(ctx, key, x, y, scale, phase = 0, flip = false, flash = false, rot = 0) {
      if (!DEFS[key]) return;
      const frame = ((Math.floor(phase * FRAMES) % FRAMES) + FRAMES) % FRAMES;
      const c = render(key, q(scale), frame, flash);
      const L = c.logical;
      ctx.imageSmoothingEnabled = false;
      if (!flip && !rot) {
        ctx.drawImage(c, x - L / 2, y - L / 2, L, L);
        return;
      }
      ctx.save();
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(c, -L / 2, -L / 2, L, L);
      ctx.restore();
    },
    // 카드·인벤토리용 아이콘(데이터 URL)
    iconURL(key, scale = 1.5) {
      const ck = 'icon|' + key + '|' + scale;
      if (cache.has(ck)) return cache.get(ck);
      const c = render(key, q(scale), 0, false);
      const [bx, by, bw, bh] = bboxOf(c);
      const side = Math.max(bw, bh) + 2;
      const out = document.createElement('canvas');
      out.width = out.height = side * 3;
      const o = out.getContext('2d');
      o.imageSmoothingEnabled = false;
      o.drawImage(c, bx, by, bw, bh, Math.floor((side - bw) / 2) * 3, Math.floor((side - bh) / 2) * 3, bw * 3, bh * 3);
      const url = out.toDataURL();
      cache.set(ck, url);
      return url;
    },
    // 초상화: 게임 속과 같은 픽셀 스프라이트를 정수배로 키워 그린다
    portrait(canvas, key, phase = 0, scale = 1.7) {
      const ctx2 = canvas.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = canvas.clientWidth || canvas.width, Hh = canvas.clientHeight || canvas.height;
      if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr); }
      ctx2.setTransform(1, 0, 0, 1, 0, 0);
      ctx2.clearRect(0, 0, canvas.width, canvas.height);
      const frame = ((Math.floor(phase * FRAMES) % FRAMES) + FRAMES) % FRAMES;
      const c = render(key, q(scale), frame, false);
      // 투명 여백을 잘라 낸 실제 그림 영역을 캔버스에 맞춘다(2배 이상이면 정수배로)
      const [bx, by, bw, bh] = bboxOf(c);
      let k = Math.min(canvas.width / bw, canvas.height / bh) * 0.92;
      if (k >= 2) k = Math.floor(k);
      const w = bw * k, h = bh * k;
      ctx2.imageSmoothingEnabled = false;
      ctx2.drawImage(c, bx, by, bw, bh, Math.round((canvas.width - w) / 2), Math.round(canvas.height - h - canvas.height * 0.03), w, h);
    },
  };
})();
