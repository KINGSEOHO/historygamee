(() => {
  'use strict';

  // ── 유틸 ──────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const params = new URLSearchParams(location.search);
  let unit = clamp(parseInt(params.get('unit'), 10) || 3, 1, 3);   // 배운 단원 범위
  let level = params.get('lv') === '2' ? 2 : 1;                       // 1 기본, 2 도전

  // ── 캔버스 ────────────────────────────────────────────
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  let VW = 0, VH = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    VW = window.innerWidth;
    VH = window.innerHeight;
    canvas.width = Math.floor(VW * DPR);
    canvas.height = Math.floor(VH * DPR);
    canvas.style.width = VW + 'px';
    canvas.style.height = VH + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // 이모지를 미리 그려 둔 스프라이트 캐시
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
  const spriteCache = new Map();
  function sprite(emoji, size) {
    const key = emoji + '|' + size;
    let c = spriteCache.get(key);
    if (!c) {
      const s = Math.ceil(size * 1.35) * 2;
      c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      g.font = `${size * 2}px ${EMOJI_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(emoji, s / 2, s / 2 + size * 0.12);
      spriteCache.set(key, c);
    }
    return c;
  }
  function drawEmoji(emoji, x, y, size, flip = false, rot = 0) {
    const c = sprite(emoji, Math.round(size));
    const w = c.width / 2;
    if (!flip && !rot) {
      ctx.drawImage(c, x - w / 2, y - w / 2, w, w);
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(c, -w / 2, -w / 2, w, w);
    ctx.restore();
  }

  // ── 효과음 ────────────────────────────────────────────
  const SFX = (() => {
    let ac = null, muted = false;
    const last = {};
    function ensure() {
      if (!ac) {
        try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
      }
      if (ac && ac.state === 'suspended') ac.resume();
    }
    function tone(f, d = 0.08, type = 'square', v = 0.04, slide = 0, delay = 0) {
      if (muted || !ac) return;
      const t0 = ac.currentTime + delay;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + d);
      g.gain.setValueAtTime(v, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g).connect(ac.destination);
      o.start(t0);
      o.stop(t0 + d + 0.02);
    }
    function throttled(name, ms, fn) {
      const n = performance.now();
      if (last[name] && n - last[name] < ms) return;
      last[name] = n;
      fn();
    }
    return {
      ensure,
      toggle() { muted = !muted; return muted; },
      hit: () => throttled('hit', 60, () => tone(260, 0.05, 'square', 0.015, -100)),
      gem: () => throttled('gem', 45, () => tone(880 + Math.random() * 200, 0.05, 'sine', 0.03)),
      hurt: () => throttled('hurt', 120, () => tone(140, 0.18, 'sawtooth', 0.05, -70)),
      boom: () => throttled('boom', 80, () => tone(90, 0.25, 'sawtooth', 0.04, -40)),
      bell: () => tone(523, 0.5, 'sine', 0.035),
      level: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'triangle', 0.06, 0, i * 0.08)),
      right: () => [659, 880].forEach((f, i) => tone(f, 0.15, 'triangle', 0.07, 0, i * 0.1)),
      wrong: () => [220, 165].forEach((f, i) => tone(f, 0.2, 'square', 0.04, 0, i * 0.14)),
      boss: () => [110, 98, 82].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.05, 0, i * 0.3)),
      pickup: () => tone(660, 0.2, 'triangle', 0.06, 400),
    };
  })();

  // ── 시대 / 적 ─────────────────────────────────────────
  // 초등 5학년 2학기 사회(2022 개정) 한국사 단원 흐름을 따른다. unit: 이 시대가 속한 단원
  const ERAS = [
    {
      name: '선사·고조선', sub: '주먹도끼 · 고인돌 · 단군왕검', unit: 1, std: '6사04-01',
      bg: '#b69c6c', deco: ['grass_dry', 'grass', 'rock', 'dolmen'],
      enemies: [
        { name: '들쥐', sprite: 'rat', hp: 7, speed: 92, dmg: 5, xp: 1, r: 12, w: 3 },
        { name: '멧돼지', sprite: 'boar', hp: 16, speed: 68, dmg: 8, xp: 2, r: 16, w: 2 },
        { name: '늑대', sprite: 'wolf', hp: 12, speed: 108, dmg: 7, xp: 2, r: 15, w: 1 },
        { name: '한나라 병사', sprite: 'han_soldier', hp: 22, speed: 70, dmg: 9, xp: 3, r: 16, w: 2 },
      ],
      boss: { name: '한나라 장수', sprite: 'han_general', hp: 420, speed: 55, dmg: 12, xp: 25, r: 42 },
    },
    {
      name: '삼국·가야', sub: '고구려 · 백제 · 신라 · 가야', unit: 1, std: '6사04-02',
      bg: '#9aa067', deco: ['grass', 'flowers', 'pine', 'rock'],
      enemies: [
        { name: '수나라 척후병', sprite: 'sui_scout', hp: 18, speed: 112, dmg: 9, xp: 2, r: 14, w: 3 },
        { name: '수나라 보병', sprite: 'sui_infantry', hp: 30, speed: 72, dmg: 10, xp: 3, r: 16, w: 3 },
        { name: '당나라 기병', sprite: 'tang_rider', hp: 28, speed: 125, dmg: 11, xp: 3, r: 18, w: 2 },
      ],
      boss: { name: '당 태종의 친위대장', sprite: 'tang_guard', hp: 900, speed: 60, dmg: 22, xp: 35, r: 44 },
    },
    {
      name: '통일 신라·발해', sub: '불국사 · 해동성국 · 청해진', unit: 1, std: '6사04-02',
      bg: '#7fa59a', deco: ['lotus', 'grass', 'rock', 'lotus'],
      enemies: [
        { name: '해적 선원', sprite: 'pirate', hp: 30, speed: 98, dmg: 11, xp: 2, r: 15, w: 3 },
        { name: '상어', sprite: 'shark', hp: 40, speed: 120, dmg: 13, xp: 3, r: 19, w: 2 },
        { name: '거대 문어', sprite: 'octopus', hp: 60, speed: 66, dmg: 14, xp: 4, r: 20, w: 2 },
      ],
      boss: { name: '해적 대선단', sprite: 'pirate_ship', hp: 1700, speed: 58, dmg: 26, xp: 45, r: 50 },
    },
    {
      name: '고려', sub: '청자 · 팔만대장경 · 금속 활자', unit: 1, std: '6사04-03',
      bg: '#a88d64', deco: ['grass_dry', 'tree_autumn', 'rock', 'grass_dry'],
      enemies: [
        { name: '거란 기병', sprite: 'khitan_rider', hp: 44, speed: 122, dmg: 14, xp: 3, r: 18, w: 3 },
        { name: '몽골 군마', sprite: 'mongol_horse', hp: 54, speed: 135, dmg: 15, xp: 3, r: 19, w: 2 },
        { name: '몽골 사냥매', sprite: 'eagle', hp: 32, speed: 150, dmg: 12, xp: 3, r: 15, w: 2 },
      ],
      boss: { name: '몽골 침략군 대장', sprite: 'mongol_chief', hp: 2800, speed: 62, dmg: 30, xp: 55, r: 52 },
    },
    {
      name: '조선', sub: '유교 문화 · 훈민정음 · 임진왜란', unit: 2, std: '6사05-01',
      bg: '#97a571', deco: ['flowers', 'pine', 'grass', 'rock'],
      enemies: [
        { name: '왜군 척후병', sprite: 'wae_scout', hp: 56, speed: 130, dmg: 15, xp: 3, r: 15, w: 3 },
        { name: '왜군 조총병', sprite: 'wae_gunner', hp: 76, speed: 82, dmg: 17, xp: 4, r: 17, w: 3 },
        { name: '왜선', sprite: 'wae_ship', hp: 110, speed: 70, dmg: 20, xp: 5, r: 22, w: 1 },
      ],
      boss: { name: '왜군 대함대', sprite: 'wae_fleet', hp: 4200, speed: 55, dmg: 34, xp: 70, r: 56 },
    },
    {
      name: '조선 후기·개항기', sub: '실학 · 서민 문화 · 근대 문물', unit: 2, std: '6사05-02',
      bg: '#a59c78', deco: ['grass', 'pine', 'rock', 'flowers'],
      enemies: [
        { name: '프랑스 군인(병인양요)', sprite: 'french_soldier', hp: 66, speed: 100, dmg: 16, xp: 4, r: 16, w: 3 },
        { name: '미국 해병(신미양요)', sprite: 'us_marine', hp: 80, speed: 92, dmg: 18, xp: 4, r: 16, w: 3 },
        { name: '이양선', sprite: 'west_boat', hp: 120, speed: 72, dmg: 21, xp: 5, r: 22, w: 1 },
      ],
      boss: { name: '서양 함대', sprite: 'steamship', hp: 5400, speed: 55, dmg: 38, xp: 80, r: 56 },
    },
    {
      name: '일제 강점기·광복', sub: '3·1 운동 · 임시 정부 · 8·15 광복', unit: 3, std: '6사06-01',
      bg: '#9c9480', deco: ['grass_dry', 'rock', 'grass', 'tree'],
      enemies: [
        { name: '일본군 보병', sprite: 'jp_soldier', hp: 76, speed: 96, dmg: 17, xp: 4, r: 16, w: 3 },
        { name: '일본 헌병', sprite: 'jp_mp', hp: 90, speed: 104, dmg: 18, xp: 4, r: 16, w: 2 },
        { name: '일본군 기병', sprite: 'jp_rider', hp: 84, speed: 128, dmg: 19, xp: 5, r: 18, w: 2 },
      ],
      boss: { name: '일본군 사령관', sprite: 'jp_officer', hp: 6500, speed: 58, dmg: 40, xp: 90, r: 52 },
    },
  ];
  const GOAL = 360;                     // 한 판 6분. 고른 단원 범위의 시대들이 이 시간을 나눠 갖는다
  const UNITS = {
    1: { label: '1단원', desc: '1단원 「유적과 유물로 살펴본 옛 사람들의 생활」' },
    2: { label: '1~2단원', desc: '1단원 + 2단원 「달라지는 시대, 변화하는 생활 모습」' },
    3: { label: '1~3단원', desc: '1~2단원 + 3단원 「식민 통치와 저항, 전쟁이 바꾼 사회와 생활」' },
  };
  const erasFor = unit => ERAS.filter(e => e.unit <= unit).length;

  // ── 영웅 ──────────────────────────────────────────────
  const HEROES = [
    { id: 'dol', name: '돌이', title: '구석기 소년', start: 'axe', perk: '이동 속도 +15%', mods: { speed: 0.15 },
      desc: '돌을 깨뜨려 만든 주먹도끼를 던지며 날쌔게 달려요.' },
    { id: 'dangun', name: '단군왕검', title: '고조선을 세운 임금', start: 'sword', perk: '경험치 +15%', mods: { xp: 0.15 },
      desc: '‘널리 인간을 이롭게 하라’는 홍익인간의 뜻을 품고 고조선을 세웠다고 전해져요.' },
    { id: 'jumong', name: '주몽', title: '고구려를 세운 왕', start: 'arrow', perk: '화살 +1', mods: { extraArrow: 1 },
      desc: '활을 매우 잘 쏘아 ‘주몽’이라는 이름을 얻었다고 해요.' },
    { id: 'yusin', name: '김유신', title: '신라의 화랑 · 장군', start: 'bell', perk: '최대 체력 +30, 받는 피해 -1', mods: { hp: 30, armor: 1 },
      desc: '화랑 출신 장군으로, 신라의 삼국 통일에 앞장섰어요.' },
    { id: 'sejong', name: '세종대왕', title: '조선 제4대 왕', start: 'rocket', perk: '재사용 대기시간 -10%', mods: { cd: 0.1 },
      desc: '훈민정음을 만들고, 신기전·측우기 같은 과학 기술을 발전시켰어요.' },
    { id: 'sunsin', name: '이순신', title: '조선 수군의 장수', start: 'gun', perk: '공격력 +15%', mods: { dmg: 0.15 },
      desc: '임진왜란 때 거북선과 함께 바다를 지켜 낸 장수예요.' },
    { id: 'jeong', name: '정약용', title: '조선 후기의 실학자', start: 'crane', perk: '경험치 +15%, 획득 범위 +30%', mods: { xp: 0.15, magnet: 0.3 },
      desc: '거중기를 만들어 수원 화성을 쌓는 데 힘을 보탰고, 백성을 위한 책을 많이 썼어요.' },
    { id: 'gwansun', name: '유관순', title: '3·1 운동의 독립운동가', start: 'shout', perk: '최대 체력 +20, 초당 체력 1 회복', mods: { hp: 20, regen: 1 },
      desc: '1919년 천안 아우내 장터에서 태극기를 나눠 주며 만세 운동을 이끌었어요.' },
    { id: 'junggeun', name: '안중근', title: '의병장 · 독립운동가', start: 'rifle', perk: '공격력 +10%, 이동 속도 +10%', mods: { dmg: 0.1, speed: 0.1 },
      desc: '대한 의군 참모중장으로 싸웠고, 1909년 하얼빈에서 이토 히로부미를 처단했어요.' },
  ];
  const heroById = id => HEROES.find(h => h.id === id) || HEROES[0];
  let heroId = 'dangun';
  try { heroId = heroById(localStorage.getItem('hs-hero') || heroId).id; } catch (e) { /* 저장소를 쓸 수 없으면 기본값 */ }

  // ── 강화(무기/유물) 정의 ─────────────────────────────
  const MAX_LV = 5;
  const UPGRADES = {
    arrow: {
      type: 'w', name: '활', icon: 'ic_bow', emoji: '🏹',
      tip: '고구려의 주몽은 활을 매우 잘 쏘았다고 해요.',
      desc: ['가장 가까운 적에게 화살을 쏩니다.', '피해량 증가, 화살 +1', '연사 속도 증가', '화살이 적 2명을 관통', '화살 +1, 피해량 증가'],
      stat: lv => ({ cd: 1.0 - 0.08 * lv, n: lv >= 5 ? 3 : lv >= 2 ? 2 : 1, dmg: 10 + 4 * lv, pierce: lv >= 4 ? 2 : 1, spd: 480 }),
    },
    axe: {
      type: 'w', name: '주먹도끼', icon: 'handaxe', emoji: '🪓',
      tip: '주먹도끼는 구석기 시대의 대표적인 뗀석기예요.',
      desc: ['위로 던진 도끼가 떨어지며 적을 관통합니다.', '피해량 증가', '도끼 +1', '피해량 증가, 쿨타임 감소', '도끼 +1'],
      stat: lv => ({ cd: 1.8 - 0.12 * lv, n: lv >= 5 ? 3 : lv >= 3 ? 2 : 1, dmg: 22 + 8 * lv, size: 26 + lv * 2 }),
    },
    sword: {
      type: 'w', name: '비파형 동검', icon: 'ic_bipa', emoji: '🗡️',
      tip: '비파형 동검은 고조선의 문화 범위를 보여 주는 청동기 유물이에요.',
      desc: ['바라보는 방향을 넓게 베어냅니다.', '범위·피해량 증가', '앞뒤 동시 베기', '피해량 증가', '범위 대폭 증가'],
      stat: lv => ({ cd: 1.35 - 0.08 * lv, dmg: 18 + 7 * lv, w: 110 + 14 * lv + (lv >= 5 ? 40 : 0), h: 52 + (lv >= 5 ? 16 : 0), both: lv >= 3 }),
    },
    mirror: {
      type: 'w', name: '청동 거울', icon: 'mirror', emoji: '🪞',
      tip: '청동 거울은 청동기 시대 지배자가 제사 때 사용했어요.',
      desc: ['주위를 도는 거울이 닿는 적을 공격합니다.', '거울 +1', '회전 속도·피해량 증가', '거울 +1', '거울 +1, 반경 증가'],
      stat: lv => ({ n: [0, 2, 3, 3, 4, 5][lv], rad: 78 + (lv >= 5 ? 22 : 4 * lv), spd: 2.6 + 0.3 * lv, dmg: 9 + 4 * lv }),
    },
    bell: {
      type: 'w', name: '성덕대왕신종', icon: 'ic_bell', emoji: '🔔',
      tip: '에밀레종이라고도 불리는 통일 신라의 범종이에요.',
      desc: ['종소리 파동이 주변 적 모두에게 피해를 줍니다.', '범위 증가', '피해량 증가', '울리는 간격 감소', '범위·피해량 대폭 증가'],
      stat: lv => ({ r: 96 + 14 * lv + (lv >= 5 ? 20 : 0), tick: lv >= 4 ? 0.8 : 1.0, dmg: 10 + 4 * lv + (lv >= 5 ? 6 : 0) }),
    },
    rocket: {
      type: 'w', name: '신기전', icon: 'ic_rocket', emoji: '🚀',
      tip: '신기전은 조선 세종 때 만든 로켓 화살 무기예요.',
      desc: ['여러 발의 로켓이 날아가 폭발합니다.', '로켓 +1', '폭발 범위 증가', '로켓 +1, 쿨타임 감소', '로켓 +2, 피해량 증가'],
      stat: lv => ({ cd: 2.8 - 0.2 * lv, n: 1 + lv + (lv >= 5 ? 1 : 0), dmg: 24 + 8 * lv, ar: 54 + 7 * lv }),
    },
    gun: {
      type: 'w', name: '승자총통', icon: 'chongtong',
      tip: '승자총통은 조선 시대에 쓰인, 손에 들고 쏘는 화기예요.',
      desc: ['가까운 적에게 무거운 탄환을 쏴 여럿을 꿰뚫습니다.', '피해량 증가', '탄환 +1', '관통 +2, 쿨타임 감소', '탄환 +1, 피해량 증가'],
      stat: lv => ({ cd: 1.55 - 0.1 * lv, n: lv >= 5 ? 3 : lv >= 3 ? 2 : 1, dmg: 26 + 9 * lv + (lv >= 5 ? 8 : 0), pierce: lv >= 4 ? 5 : 3, spd: 560 }),
    },
    crane: {
      type: 'w', name: '거중기', icon: 'ic_crane',
      tip: '정약용이 만든 거중기는 도르래로 무거운 돌을 들어 올렸어요.',
      desc: ['적 머리 위로 큰 돌을 떨어뜨려 주변까지 피해를 줍니다.', '돌 +1', '피해 범위 증가', '돌 +1, 쿨타임 감소', '돌 +1, 피해량 증가'],
      stat: lv => ({ cd: 2.3 - 0.15 * lv, n: 1 + Math.floor((lv + 1) / 2) + (lv >= 5 ? 1 : 0), dmg: 32 + 11 * lv, ar: 48 + 6 * lv + (lv >= 3 ? 10 : 0) }),
    },
    shout: {
      type: 'w', name: '만세 함성', icon: 'ic_flag',
      tip: '1919년 3·1 운동 때 사람들은 태극기를 들고 "대한 독립 만세!"를 외쳤어요.',
      desc: ['퍼져 나가는 함성이 적에게 피해를 주고 멀리 밀어냅니다.', '범위 증가', '피해량 증가', '쿨타임 감소', '함성이 두 겹으로 퍼집니다'],
      stat: lv => ({ cd: lv >= 4 ? 1.6 : 2.0, maxR: 120 + 20 * lv, dmg: 12 + 6 * lv, kb: 300, waves: lv >= 5 ? 2 : 1 }),
    },
    rifle: {
      type: 'w', name: '의병 소총', icon: 'ic_rifle',
      tip: '의병은 나라를 지키려고 스스로 일어난 군대예요. 안중근도 의병으로 싸웠어요.',
      desc: ['화면에서 가장 튼튼한 적(보스 포함)을 노려 강한 한 발을 쏩니다.', '피해량 증가', '관통 +1', '두 발씩 쏩니다', '피해량 대폭 증가'],
      stat: lv => ({ cd: 1.7 - 0.1 * lv, n: lv >= 4 ? 2 : 1, dmg: 52 + 18 * lv + (lv >= 5 ? 30 : 0), pierce: lv >= 3 ? 2 : 1, spd: 950 }),
    },
    shoes: { type: 'p', name: '짚신', icon: 'ic_shoes', emoji: '👡', tip: '볏짚으로 엮어 만든 옛 신발이에요.', desc: ['이동 속도 +10%'] },
    armor: { type: 'p', name: '갑옷', icon: 'ic_armor', emoji: '🛡️', tip: '가야는 철로 만든 갑옷으로 유명했어요.', desc: ['받는 피해 -1'] },
    jige: { type: 'p', name: '보부상 지게', icon: 'ic_jige', emoji: '🎒', tip: '보부상은 장터를 돌며 물건을 팔던 상인이에요.', desc: ['경험치 획득 범위 +35%'] },
    book: { type: 'p', name: '서책', icon: 'ic_scroll', emoji: '📜', tip: '조선의 선비들은 서원과 향교에서 공부했어요.', desc: ['경험치 획득량 +10%'] },
    ginseng: { type: 'p', name: '인삼', icon: 'ic_ginseng', emoji: '🌱', tip: '고려 인삼은 외국에서도 인기 있는 특산물이었어요.', desc: ['최대 체력 +20, 초당 체력 0.5 회복'] },
    powder: { type: 'p', name: '화약', icon: 'ic_powder', emoji: '💥', tip: '고려 말 최무선은 화약을 만들어 왜구를 물리쳤어요.', desc: ['모든 공격 피해량 +12%'] },
    sundial: { type: 'p', name: '앙부일구', icon: 'ic_sundial', emoji: '☀️', tip: '앙부일구는 세종 때 만든 솥 모양 해시계예요.', desc: ['모든 무기 재사용 대기시간 -8%'] },
  };
  const WEAPON_IDS = Object.keys(UPGRADES).filter(k => UPGRADES[k].type === 'w');

  // ── 게임 상태 ─────────────────────────────────────────
  let G = null;
  let state = 'title';   // title | play | quiz | upgrade | paused | over
  let eid = 0;

  function xpFor(lv) { return Math.floor(8 + lv * 3 + lv * lv * 0.35); }

  function newGame() {
    G = {
      t: 0, era: -1, eraCount: erasFor(unit), eraLen: GOAL / erasFor(unit), kills: 0, level: 1, xp: 0, xpNeed: xpFor(1), pendingLv: 0, pendingChest: 0,
      player: {
        x: 0, y: 0, r: 15, hp: 100, maxHp: 100, baseSpeed: 165, speed: 165, armor: 0, magnet: 70,
        regen: 0, dmgMul: 1, cdMul: 1, xpMul: 1, inv: 0, fx: 1, fy: 0, face: 1, anim: 0,
      },
      hero: heroById(heroId),
      weapons: { [heroById(heroId).start]: 1 }, passives: {}, timers: {},
      enemies: [], projs: [], drops: [], waves: [], gems: [], items: [], fx: [], texts: [],
      spawnT: 1, waveT: 25, bossSpawned: {}, mirrorAng: 0,
      quizRight: 0, quizTotal: 0, wrongNote: [], usedQ: new Set(), stdStats: {},
      bossesKilled: 0, shake: 0,
    };
    recomputeStats();
  }

  function lvOf(id) { return G.weapons[id] || G.passives[id] || 0; }

  function recomputeStats() {
    const p = G.player;
    const oldMax = p.maxHp;
    const m = G.hero.mods;
    p.speed = p.baseSpeed * (1 + 0.1 * (G.passives.shoes || 0) + (m.speed || 0));
    p.armor = (G.passives.armor || 0) + (m.armor || 0);
    p.magnet = 70 * (1 + 0.35 * (G.passives.jige || 0) + (m.magnet || 0));
    p.xpMul = 1 + 0.1 * (G.passives.book || 0) + (m.xp || 0);
    p.maxHp = 100 + 20 * (G.passives.ginseng || 0) + (m.hp || 0);
    p.regen = 0.5 * (G.passives.ginseng || 0) + (m.regen || 0);
    p.dmgMul = 1 + 0.12 * (G.passives.powder || 0) + (m.dmg || 0);
    p.cdMul = 1 - 0.08 * (G.passives.sundial || 0) - (m.cd || 0);
    if (p.maxHp > oldMax) p.hp += p.maxHp - oldMax;
    p.hp = Math.min(p.hp, p.maxHp);
  }

  // ── 입력 ──────────────────────────────────────────────
  const keys = {};
  const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };

  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    onKeyCommand(e);
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    if (state === 'play') pauseGame();
  });

  canvas.addEventListener('pointerdown', e => {
    if (state !== 'play') return;
    joy.active = true; joy.id = e.pointerId;
    joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (joy.active && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; }
  });
  const endJoy = e => { if (e.pointerId === joy.id) joy.active = false; };
  canvas.addEventListener('pointerup', endJoy);
  canvas.addEventListener('pointercancel', endJoy);

  function onKeyCommand(e) {
    const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
    const confirm = e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter';
    if (state === 'title' && confirm) startGame();
    else if (state === 'play' && (e.code === 'Escape' || e.code === 'KeyP')) pauseGame();
    else if (state === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) resumeGame();
    else if (state === 'quiz') {
      if (quiz && !quiz.answered && n !== undefined && n < quiz.order.length) answerQuiz(n);
      else if (quiz && quiz.answered && confirm) afterQuiz();
    } else if (state === 'upgrade' && n !== undefined) {
      const btn = $('up-cards').children[n];
      if (btn) btn.click();
    } else if (state === 'over' && confirm) startGame();
  }

  function moveInput() {
    let mx = 0, my = 0;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (keys.KeyW || keys.ArrowUp) my -= 1;
    if (keys.KeyS || keys.ArrowDown) my += 1;
    if (joy.active) {
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > 8) { const m = Math.min(1, d / 50); mx = dx / d * m; my = dy / d * m; }
    }
    const d = Math.hypot(mx, my);
    if (d > 1) { mx /= d; my /= d; }
    return [mx, my];
  }

  // ── 스폰 ──────────────────────────────────────────────
  function spawnDist() { return Math.hypot(VW, VH) / 2 + 50; }

  function makeEnemy(type, x, y, boss = false) {
    const hpMul = boss ? 1 + G.t / 900 : 1 + G.t / 260;
    return {
      id: ++eid, x, y, r: type.r, name: type.name, sprite: type.sprite, boss, anim: Math.random(), face: 1,
      hp: type.hp * hpMul, maxHp: type.hp * hpMul,
      speed: type.speed * (boss ? 1 : rand(0.88, 1.12)),
      dmg: type.dmg, xp: type.xp,
      flash: 0, kx: 0, ky: 0, mirrorCd: 0, bellCd: 0,
    };
  }

  function weightedType(list) {
    let total = 0;
    for (const e of list) total += e.w;
    let r = Math.random() * total;
    for (const e of list) { if ((r -= e.w) <= 0) return e; }
    return list[0];
  }

  function spawnEnemy() {
    if (G.enemies.length > 420) return;
    const p = G.player;
    const a = Math.random() * Math.PI * 2, d = spawnDist();
    const type = weightedType(ERAS[G.era].enemies);
    G.enemies.push(makeEnemy(type, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d));
  }

  function spawnRing(n) {
    const p = G.player, d = spawnDist();
    const type = ERAS[G.era].enemies[0];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      G.enemies.push(makeEnemy(type, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d));
    }
  }

  function spawnBoss(era) {
    const p = G.player, b = ERAS[era].boss;
    const a = Math.random() * Math.PI * 2, d = spawnDist();
    G.enemies.push(makeEnemy(b, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, true));
    showBanner(`⚠ ${b.name} 등장!`, '쓰러뜨리면 보물상자를 얻어요', true);
    SFX.boss();
  }

  // ── 전투 ──────────────────────────────────────────────
  function nearestEnemy(x, y, maxD) {
    let best = null, bd = maxD * maxD;
    for (const e of G.enemies) {
      if (e.hp <= 0) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function hurt(e, base, kx = 0, ky = 0) {
    if (e.hp <= 0) return;
    const dmg = Math.max(1, Math.round(base * G.player.dmgMul * rand(0.9, 1.1)));
    e.hp -= dmg;
    e.flash = 0.1;
    if (!e.boss) { e.kx += kx; e.ky += ky; }
    G.texts.push({ x: e.x + rand(-8, 8), y: e.y - e.r, text: dmg, life: 0.6, color: '#fff' });
    if (G.texts.length > 90) G.texts.shift();
    SFX.hit();
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    G.kills++;
    if (e.boss) {
      G.bossesKilled++;
      G.items.push({ kind: 'chest', x: e.x, y: e.y, emoji: '🎁' });
      for (let i = 0; i < 12; i++) G.gems.push({ x: e.x + rand(-60, 60), y: e.y + rand(-60, 60), v: Math.ceil(e.xp / 6) });
      G.fx.push({ k: 'boom', x: e.x, y: e.y, r: 120, life: 0.5, max: 0.5 });
      G.shake = 0.4;
      SFX.boom();
      return;
    }
    G.gems.push({ x: e.x, y: e.y, v: e.xp });
    const r = Math.random();
    if (r < 0.012) G.items.push({ kind: 'food', x: e.x, y: e.y, emoji: '' });
    else if (r < 0.016) G.items.push({ kind: 'magnet', x: e.x, y: e.y, emoji: '' });
    if (G.gems.length > 500) mergeGems();
  }

  // 화면에 경험치 구슬이 너무 많으면 먼 구슬을 하나로 합친다
  function mergeGems() {
    const p = G.player;
    G.gems.sort((a, b) => ((b.x - p.x) ** 2 + (b.y - p.y) ** 2) - ((a.x - p.x) ** 2 + (a.y - p.y) ** 2));
    const far = G.gems.splice(0, 150);
    const sum = far.reduce((s, g) => s + g.v, 0);
    G.gems.push({ x: far[0].x, y: far[0].y, v: sum });
  }

  const FIRE = {
    arrow(s) {
      const p = G.player;
      const t = nearestEnemy(p.x, p.y, 560);
      const ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.fy, p.fx);
      const n = s.n + (G.hero.mods.extraArrow || 0);
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * 0.14;
        G.projs.push({ k: 'arrow', x: p.x, y: p.y, vx: Math.cos(a) * s.spd, vy: Math.sin(a) * s.spd,
          dmg: s.dmg, pierce: s.pierce, life: 1.3, r: 8, hit: new Set() });
      }
    },
    axe(s) {
      const p = G.player;
      for (let i = 0; i < s.n; i++) {
        const side = s.n === 1 ? p.face : (i % 2 ? -1 : 1);
        G.projs.push({ k: 'axe', x: p.x, y: p.y, vx: side * rand(70, 170) + rand(-30, 30), vy: -rand(430, 520),
          dmg: s.dmg, pierce: Infinity, life: 2.4, r: s.size * 0.55, size: s.size, rot: 0, hit: new Set() });
      }
    },
    sword(s) {
      const p = G.player;
      // 가까운 적이 있는 쪽을 먼저 벤다
      const t = nearestEnemy(p.x, p.y, s.w + 80);
      const main = t ? (t.x >= p.x ? 1 : -1) : p.face;
      const dirs = s.both ? [main, -main] : [main];
      for (const dir of dirs) {
        const x0 = dir > 0 ? p.x : p.x - s.w, x1 = dir > 0 ? p.x + s.w : p.x;
        const y0 = p.y - s.h / 2, y1 = p.y + s.h / 2;
        for (const e of G.enemies) {
          if (e.hp <= 0) continue;
          const cx = clamp(e.x, x0, x1), cy = clamp(e.y, y0, y1);
          if ((e.x - cx) ** 2 + (e.y - cy) ** 2 < e.r * e.r) hurt(e, s.dmg, dir * 160, 0);
        }
        G.fx.push({ k: 'slash', x: p.x, y: p.y, dir, w: s.w, h: s.h, life: 0.2, max: 0.2 });
      }
    },
    gun(s) {
      const p = G.player;
      const t = nearestEnemy(p.x, p.y, 600);
      const ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.fy, p.fx);
      for (let i = 0; i < s.n; i++) {
        const a = ang + (i - (s.n - 1) / 2) * 0.1;
        G.projs.push({ k: 'shot', x: p.x, y: p.y, vx: Math.cos(a) * s.spd, vy: Math.sin(a) * s.spd,
          dmg: s.dmg, pierce: s.pierce, life: 1.2, r: 7, hit: new Set() });
      }
      G.fx.push({ k: 'smoke', x: p.x + Math.cos(ang) * 18, y: p.y + Math.sin(ang) * 18, life: 0.45, max: 0.45, big: true });
      SFX.boom();
    },
    crane(s) {
      const p = G.player;
      const cands = G.enemies.filter(e => e.hp > 0 && Math.abs(e.x - p.x) < VW / 2 && Math.abs(e.y - p.y) < VH / 2);
      for (let i = 0; i < s.n; i++) {
        const t = cands.length ? pick(cands) : null;
        G.drops.push({ x: t ? t.x : p.x + rand(-200, 200), y: t ? t.y : p.y + rand(-200, 200), t: 0.55, max: 0.55, dmg: s.dmg, ar: s.ar });
      }
    },
    shout(s) {
      const p = G.player;
      for (let i = 0; i < s.waves; i++) {
        G.waves.push({ x: p.x, y: p.y, r: 14 - i * 60, maxR: s.maxR, dmg: s.dmg, kb: s.kb, hit: new Set() });
      }
      G.texts.push({ x: p.x, y: p.y - 34, text: '만세!', life: 0.7, color: '#fff3b0' });
    },
    rifle(s) {
      const p = G.player;
      // 화면 안에서 남은 체력이 가장 많은 적을 노린다
      let t = null;
      for (const e of G.enemies) {
        if (e.hp <= 0 || Math.abs(e.x - p.x) > VW / 2 || Math.abs(e.y - p.y) > VH / 2) continue;
        if (!t || e.hp > t.hp) t = e;
      }
      const ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.fy, p.fx);
      for (let i = 0; i < s.n; i++) {
        const a = ang + (i ? 0.06 : 0);
        G.projs.push({ k: 'bullet', x: p.x, y: p.y, vx: Math.cos(a) * s.spd, vy: Math.sin(a) * s.spd,
          dmg: s.dmg, pierce: s.pierce, life: 0.9, r: 6, hit: new Set() });
      }
      G.fx.push({ k: 'smoke', x: p.x + Math.cos(ang) * 20, y: p.y + Math.sin(ang) * 20, life: 0.35, max: 0.35 });
      SFX.hit();
    },
    rocket(s) {
      const p = G.player;
      const cands = G.enemies.filter(e => e.hp > 0 && Math.abs(e.x - p.x) < VW / 2 + 20 && Math.abs(e.y - p.y) < VH / 2 + 20);
      for (let i = 0; i < s.n; i++) {
        const t = cands.length ? pick(cands) : null;
        const tx = t ? t.x : p.x + rand(-250, 250), ty = t ? t.y : p.y + rand(-250, 250);
        const a = -Math.PI / 2 + rand(-1.1, 1.1);
        G.projs.push({ k: 'rocket', x: p.x, y: p.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
          tx, ty, target: t, dmg: s.dmg, ar: s.ar, life: 2.5, r: 6 });
      }
    },
  };

  function explode(x, y, r, dmg) {
    for (const e of G.enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
      if (d < r + e.r) hurt(e, dmg, dx / d * 120, dy / d * 120);
    }
    G.fx.push({ k: 'boom', x, y, r, life: 0.3, max: 0.3 });
    SFX.boom();
  }

  function updateWeapons(dt) {
    const p = G.player;
    for (const id in G.weapons) {
      const s = UPGRADES[id].stat(G.weapons[id]);
      if (id === 'mirror') {
        G.mirrorAng += s.spd * dt;
        for (let i = 0; i < s.n; i++) {
          const a = G.mirrorAng + i / s.n * Math.PI * 2;
          const mx = p.x + Math.cos(a) * s.rad, my = p.y + Math.sin(a) * s.rad;
          for (const e of G.enemies) {
            if (e.hp <= 0 || e.mirrorCd > 0) continue;
            if ((e.x - mx) ** 2 + (e.y - my) ** 2 < (e.r + 14) ** 2) {
              e.mirrorCd = 0.45;
              hurt(e, s.dmg, Math.cos(a) * 140, Math.sin(a) * 140);
            }
          }
        }
        continue;
      }
      if (id === 'bell') {
        G.timers.bell = (G.timers.bell ?? 0.5) - dt;
        if (G.timers.bell <= 0) {
          G.timers.bell = s.tick * p.cdMul;
          for (const e of G.enemies) {
            if (e.hp <= 0) continue;
            const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
            if (d < s.r + e.r) hurt(e, s.dmg, dx / d * 60, dy / d * 60);
          }
          G.fx.push({ k: 'ring', x: p.x, y: p.y, r: s.r, life: 0.4, max: 0.4 });
        }
        continue;
      }
      G.timers[id] = (G.timers[id] ?? 0.2) - dt;
      if (G.timers[id] > 0) continue;
      G.timers[id] = s.cd * p.cdMul;
      FIRE[id](s);
    }
  }

  function updateAreaAttacks(dt) {
    for (const d of G.drops) {
      d.t -= dt;
      if (d.t > 0) continue;
      for (const e of G.enemies) {
        if (e.hp <= 0) continue;
        const dx = e.x - d.x, dy = e.y - d.y, dd = Math.hypot(dx, dy) || 1;
        if (dd < d.ar + e.r) hurt(e, d.dmg, dx / dd * 100, dy / dd * 100);
      }
      G.fx.push({ k: 'dust', x: d.x, y: d.y, r: d.ar, life: 0.45, max: 0.45 });
      G.shake = Math.max(G.shake, 0.12);
      SFX.boom();
    }
    G.drops = G.drops.filter(d => d.t > 0);

    for (const w of G.waves) {
      w.r += 430 * dt;
      if (w.r < 0) continue;
      for (const e of G.enemies) {
        if (e.hp <= 0 || w.hit.has(e.id)) continue;
        const dx = e.x - w.x, dy = e.y - w.y, dd = Math.hypot(dx, dy) || 1;
        if (Math.abs(dd - w.r) < e.r + 10) {
          w.hit.add(e.id);
          hurt(e, w.dmg, dx / dd * w.kb, dy / dd * w.kb);
        }
      }
    }
    G.waves = G.waves.filter(w => w.r < w.maxR);
  }

  function updateProjs(dt) {
    for (const pr of G.projs) {
      pr.life -= dt;
      if (pr.k === 'rocket') {
        if (pr.target && pr.target.hp > 0) { pr.tx = pr.target.x; pr.ty = pr.target.y; }
        const dx = pr.tx - pr.x, dy = pr.ty - pr.y, d = Math.hypot(dx, dy) || 1;
        const spd = 430;
        const k = Math.min(1, dt * 4);
        pr.vx += (dx / d * spd - pr.vx) * k;
        pr.vy += (dy / d * spd - pr.vy) * k;
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        if (Math.random() < 0.6) G.fx.push({ k: 'smoke', x: pr.x, y: pr.y, life: 0.3, max: 0.3 });
        if (d < 16 || pr.life <= 0) { explode(pr.x, pr.y, pr.ar, pr.dmg); pr.life = 0; }
        continue;
      }
      if (pr.k === 'axe') { pr.vy += 950 * dt; pr.rot += dt * 12 * Math.sign(pr.vx || 1); }
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      for (const e of G.enemies) {
        if (e.hp <= 0 || pr.hit.has(e.id)) continue;
        if ((e.x - pr.x) ** 2 + (e.y - pr.y) ** 2 < (e.r + pr.r) ** 2) {
          pr.hit.add(e.id);
          const v = Math.hypot(pr.vx, pr.vy) || 1;
          hurt(e, pr.dmg, pr.vx / v * 90, pr.vy / v * 90);
          if (--pr.pierce <= 0) { pr.life = 0; break; }
        }
      }
    }
    G.projs = G.projs.filter(p => p.life > 0);
  }

  // 같은 칸에 몰린 적끼리 살짝 밀어내기
  function separate() {
    const cell = 44, grid = new Map();
    for (const e of G.enemies) {
      const key = Math.floor(e.x / cell) * 100003 + Math.floor(e.y / cell);
      let b = grid.get(key);
      if (!b) grid.set(key, b = []);
      b.push(e);
    }
    for (const e of G.enemies) {
      const cx = Math.floor(e.x / cell), cy = Math.floor(e.y / cell);
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iy = cy - 1; iy <= cy + 1; iy++) {
          const b = grid.get(ix * 100003 + iy);
          if (!b) continue;
          for (const o of b) {
            if (o === e) continue;
            const dx = e.x - o.x, dy = e.y - o.y, min = (e.r + o.r) * 0.8;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min || d2 === 0) continue;
            const d = Math.sqrt(d2), push = (min - d) * 0.25;
            const wE = e.boss ? 0.05 : 1;
            e.x += dx / d * push * wE; e.y += dy / d * push * wE;
          }
        }
      }
    }
  }

  function updateEnemies(dt) {
    const p = G.player, far = spawnDist() + 260;
    for (const e of G.enemies) {
      if (e.hp <= 0) continue;
      e.flash -= dt; e.mirrorCd -= dt;
      e.anim += dt * (Sprites.info(e.sprite).fly ? 3 : e.speed / 45);
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d * e.speed + e.kx) * dt;
      e.y += (dy / d * e.speed + e.ky) * dt;
      const decay = Math.min(1, dt * 9);
      e.kx -= e.kx * decay; e.ky -= e.ky * decay;
      if (Math.abs(dx) > 4) e.face = dx > 0 ? 1 : -1;
      if (d < e.r + p.r * 0.8 && p.inv <= 0) {
        const dmg = Math.max(1, Math.round(e.dmg - p.armor));
        p.hp -= dmg;
        p.inv = 0.5;
        G.shake = Math.max(G.shake, 0.15);
        G.texts.push({ x: p.x, y: p.y - 24, text: '-' + dmg, life: 0.8, color: '#ff6b5b' });
        SFX.hurt();
      }
      // 너무 멀리 떨어진 일반 적은 플레이어 반대편으로 다시 배치
      if (!e.boss && d > far) { e.x = p.x + dx * 0.85; e.y = p.y + dy * 0.85; }
    }
    G.enemies = G.enemies.filter(e => e.hp > 0);
    separate();
  }

  function updatePickups(dt) {
    const p = G.player;
    for (const g of G.gems) {
      const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1;
      if (g.pull || d < p.magnet) {
        g.pull = true;
        const spd = 520 + (g.boost || 0);
        g.x += dx / d * spd * dt; g.y += dy / d * spd * dt;
      }
      if (d < p.r + 8) {
        g.dead = true;
        G.xp += g.v * p.xpMul;
        SFX.gem();
      }
    }
    G.gems = G.gems.filter(g => !g.dead);

    for (const it of G.items) {
      const d = Math.hypot(p.x - it.x, p.y - it.y);
      if (d > p.r + 18) continue;
      it.dead = true;
      SFX.pickup();
      if (it.kind === 'food') {
        const heal = Math.min(30, p.maxHp - p.hp);
        p.hp += heal;
        G.texts.push({ x: p.x, y: p.y - 30, text: '+' + Math.round(heal), life: 0.9, color: '#6be36b' });
      } else if (it.kind === 'magnet') {
        for (const g of G.gems) { g.pull = true; g.boost = 300; }
      } else if (it.kind === 'chest') {
        G.pendingChest++;
      }
    }
    G.items = G.items.filter(i => !i.dead);
  }

  // ── 메인 업데이트 ─────────────────────────────────────
  function update(dt) {
    G.t += dt;
    const p = G.player;

    const era = Math.min(G.eraCount - 1, Math.floor(G.t / G.eraLen));
    if (era !== G.era) {
      G.era = era;
      showBanner(ERAS[era].name, ERAS[era].sub);
      updateHudEra();
    }
    if (G.t >= GOAL) { endGame(true); return; }
    if (G.t - era * G.eraLen >= G.eraLen * 0.66 && !G.bossSpawned[era]) {
      G.bossSpawned[era] = true;
      spawnBoss(era);
    }

    const [mx, my] = moveInput();
    p.x += mx * p.speed * dt;
    p.y += my * p.speed * dt;
    if (mx || my) {
      const m = Math.hypot(mx, my);
      p.fx = mx / m; p.fy = my / m;
      if (Math.abs(mx) > 0.15) p.face = Math.sign(mx);
      p.anim += dt * 2.2;
    }
    p.inv -= dt;
    if (p.regen) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = Math.max(0.2, 0.8 - G.t * 0.0016);
      const n = 1 + Math.floor(G.t / 120);
      for (let i = 0; i < n; i++) spawnEnemy();
    }
    G.waveT -= dt;
    if (G.waveT <= 0) { G.waveT = 30; spawnRing(10 + G.era * 4); }

    updateWeapons(dt);
    updateProjs(dt);
    updateAreaAttacks(dt);
    updateEnemies(dt);
    updatePickups(dt);

    for (const f of G.fx) f.life -= dt;
    G.fx = G.fx.filter(f => f.life > 0);
    for (const t of G.texts) { t.life -= dt; t.y -= 40 * dt; }
    G.texts = G.texts.filter(t => t.life > 0);
    G.shake = Math.max(0, G.shake - dt);

    if (p.hp <= 0) { p.hp = 0; endGame(false); return; }

    while (G.xp >= G.xpNeed) {
      G.xp -= G.xpNeed;
      G.level++;
      G.xpNeed = xpFor(G.level);
      G.pendingLv++;
    }
    checkPending();
  }

  function checkPending() {
    if (G.pendingChest > 0) { G.pendingChest--; openUpgrade(3, '🎁 보물상자를 열었어요! 강화 하나를 고르세요.', true); return true; }
    if (G.pendingLv > 0) { G.pendingLv--; SFX.level(); openQuiz(); return true; }
    return false;
  }

  // ── 렌더링 ────────────────────────────────────────────
  function hash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return (h ^ (h >>> 16)) >>> 0;
  }

  // 시대마다 바닥 색에 어울리는 얼룩을 찍은 타일(2px 단위 픽셀)
  const tiles = {};
  function groundTile(era) {
    if (tiles[era]) return tiles[era];
    const S = 128, c = document.createElement('canvas');
    c.width = c.height = S;
    const t = c.getContext('2d');
    t.fillStyle = ERAS[era].bg;
    t.fillRect(0, 0, S, S);
    let seed = 1234 + era * 777;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const base = ERAS[era].bg;
    const tone = amt => {
      const n = parseInt(base.slice(1), 16), f = v => clamp(Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt), 0, 255);
      return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
    };
    const tones = [tone(-0.07), tone(-0.12), tone(0.08), tone(-0.04)];
    for (let i = 0; i < 160; i++) {
      t.fillStyle = tones[i % tones.length];
      const x = Math.floor(rnd() * 64) * 2, y = Math.floor(rnd() * 64) * 2;
      t.fillRect(x, y, rnd() < 0.3 ? 4 : 2, 2);
    }
    tiles[era] = c;
    return c;
  }

  function render() {
    const era = ERAS[Math.max(0, G ? G.era : 0)];
    ctx.fillStyle = era.bg;
    ctx.fillRect(0, 0, VW, VH);
    if (!G) return;
    const p = G.player;
    let cx = p.x - VW / 2, cy = p.y - VH / 2;
    if (G.shake > 0) { cx += rand(-5, 5) * G.shake * 2; cy += rand(-5, 5) * G.shake * 2; }

    // 바닥: 픽셀 얼룩 타일을 깔고, 장식은 칸마다 정해진 자리에 놓는다
    const tile = groundTile(Math.max(0, G.era));
    const TS = tile.width;
    const ox = Math.floor(cx / TS) * TS, oy = Math.floor(cy / TS) * TS;
    ctx.imageSmoothingEnabled = false;
    for (let x = ox; x < cx + VW; x += TS) {
      for (let y = oy; y < cy + VH; y += TS) ctx.drawImage(tile, Math.round(x - cx), Math.round(y - cy));
    }
    const D = 128;
    for (let gy = Math.floor(cy / D) - 1; gy < (cy + VH) / D + 1; gy++) {
      for (let gx = Math.floor(cx / D) - 1; gx < (cx + VW) / D + 1; gx++) {
        const h = hash(gx, gy);
        if (h % 4 !== 0) continue;
        const key = era.deco[(h >>> 4) % era.deco.length];
        Sprites.draw(ctx, key, Math.round(gx * D + (h >>> 8) % D - cx), Math.round(gy * D + (h >>> 16) % D - cy), key === 'dolmen' ? 1.5 : key.startsWith('grass') || key === 'flowers' ? 1.5 : 1.1);
      }
    }

    ctx.save();
    ctx.translate(-cx, -cy);

    // 종 오라
    if (G.weapons.bell) {
      const s = UPGRADES.bell.stat(G.weapons.bell);
      ctx.fillStyle = 'rgba(255, 220, 120, 0.07)';
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.25)';
      ctx.beginPath(); ctx.arc(p.x, p.y, s.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // 경험치 곡옥
    for (const g of G.gems) {
      if (Math.abs(g.x - p.x) > VW / 2 + 20 || Math.abs(g.y - p.y) > VH / 2 + 20) continue;
      if (g.v >= 10) Sprites.draw(ctx, 'gogok_r', g.x, g.y, 1.3);
      else if (g.v >= 3) Sprites.draw(ctx, 'gogok_g', g.x, g.y, 1.1);
      else Sprites.draw(ctx, 'gogok_b', g.x, g.y, 0.9);
    }

    // 아이템
    const bob = Math.sin(G.t * 4) * 3;
    for (const it of G.items) {
      if (it.kind === 'chest') {
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.ellipse(it.x, it.y + 14, 15, 4, 0, 0, Math.PI * 2); ctx.fill();
        Sprites.draw(ctx, 'chest', it.x, it.y + bob * 0.5, 1.05, G.t * 0.8);
      } else Sprites.draw(ctx, it.kind === 'food' ? 'songpyeon' : 'magnet', it.x, it.y + bob, 0.95);
    }

    // 적과 플레이어 — 그림자를 먼저 깔고, 아래쪽에 있는 캐릭터가 앞에 오도록 y 순서로 그린다
    const visible = [];
    for (const e of G.enemies) {
      if (Math.abs(e.x - p.x) > VW / 2 + 120 || Math.abs(e.y - p.y) > VH / 2 + 120) continue;
      const info = Sprites.info(e.sprite);
      const sc = e.r / 16 * (info.mul || 0.95);
      const sy = e.y + (info.shadowY || 22) * sc;
      if (e.boss) {
        const glow = ctx.createRadialGradient(e.x, sy, 0, e.x, sy, e.r * 1.3);
        glow.addColorStop(0, 'rgba(255,70,50,.45)');
        glow.addColorStop(1, 'rgba(255,70,50,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.ellipse(e.x, sy, e.r * 1.3, e.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      }
      if (!info.fly) {
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.beginPath(); ctx.ellipse(e.x, sy, 14 * sc, 4.5 * sc, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,.15)';
        ctx.beginPath(); ctx.ellipse(e.x, e.y + 30 * sc, 9 * sc, 3 * sc, 0, 0, Math.PI * 2); ctx.fill();
      }
      visible.push({ y: sy, e, sc });
    }
    const PSC = 1.05;
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 22 * PSC, 13, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    visible.push({ y: p.y + 22 * PSC, player: true });
    visible.sort((a, b) => a.y - b.y);

    for (const v of visible) {
      if (v.player) {
        if (p.inv <= 0 || Math.floor(p.inv * 20) % 2 === 0) {
          Sprites.draw(ctx, G.hero.id, p.x, p.y, PSC, p.anim, p.face < 0);
        }
        const hpw = 36;
        ctx.fillStyle = '#000'; ctx.fillRect(p.x - hpw / 2, p.y + 26, hpw, 5);
        ctx.fillStyle = '#e8473a'; ctx.fillRect(p.x - hpw / 2, p.y + 26, hpw * p.hp / p.maxHp, 5);
        continue;
      }
      const e = v.e;
      Sprites.draw(ctx, e.sprite, e.x, e.y, v.sc, e.anim, e.face < 0, e.flash > 0);
      if (e.boss) {
        const w = e.r * 2, top = e.y - 40 * v.sc;
        ctx.fillStyle = '#000'; ctx.fillRect(e.x - w / 2 - 1, top - 1, w + 2, 8);
        ctx.fillStyle = '#ff4b3a'; ctx.fillRect(e.x - w / 2, top, w * Math.max(0, e.hp / e.maxHp), 6);
        ctx.font = 'bold 12px "Noto Sans KR", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
        ctx.strokeText(e.name, e.x, top - 5);
        ctx.fillStyle = '#ffd9d0';
        ctx.fillText(e.name, e.x, top - 5);
      }
    }

    // 투사체
    for (const pr of G.projs) {
      if (pr.k === 'arrow') {
        const a = Math.atan2(pr.vy, pr.vx);
        ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(a);
        ctx.strokeStyle = '#f3e3c0'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(8, 0); ctx.stroke();
        ctx.fillStyle = '#ddd';
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(5, -4); ctx.lineTo(5, 4); ctx.fill();
        ctx.fillStyle = '#d9534f';
        ctx.fillRect(-15, -3, 4, 6);
        ctx.restore();
      } else if (pr.k === 'shot') {
        ctx.fillStyle = 'rgba(80,80,80,.35)';
        ctx.beginPath(); ctx.arc(pr.x - pr.vx * 0.02, pr.y - pr.vy * 0.02, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#24160d';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 5.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a5a62';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#b8b8c0';
        ctx.fillRect(Math.round(pr.x - 2), Math.round(pr.y - 2), 2, 2);
      } else if (pr.k === 'bullet') {
        const v = Math.hypot(pr.vx, pr.vy) || 1;
        ctx.strokeStyle = 'rgba(255,240,170,.9)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(pr.x - pr.vx / v * 18, pr.y - pr.vy / v * 18); ctx.lineTo(pr.x, pr.y); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(pr.x - 1.5), Math.round(pr.y - 1.5), 3, 3);
      } else if (pr.k === 'axe') {
        Sprites.draw(ctx, 'handaxe', pr.x, pr.y, pr.size / 24, 0, false, false, pr.rot);
      } else if (pr.k === 'rocket') {
        const a = Math.atan2(pr.vy, pr.vx);
        ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(a);
        ctx.fillStyle = '#8b5a2b'; ctx.fillRect(-12, -1.5, 18, 3);
        ctx.fillStyle = '#c0392b'; ctx.fillRect(2, -3, 7, 6);
        ctx.fillStyle = '#ffcc33';
        ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-20 - Math.random() * 6, -3); ctx.lineTo(-20 - Math.random() * 6, 3); ctx.fill();
        ctx.restore();
      }
    }

    // 거중기 돌: 떨어질 자리에 그림자, 위에서 밧줄에 매달린 돌이 내려온다
    for (const d of G.drops) {
      const k = d.t / d.max;
      ctx.fillStyle = `rgba(60,30,10,${0.15 + (1 - k) * 0.3})`;
      ctx.beginPath(); ctx.ellipse(d.x, d.y + 6, d.ar * (1 - k * 0.5), d.ar * 0.35 * (1 - k * 0.5), 0, 0, Math.PI * 2); ctx.fill();
      const sy = d.y - k * 160;
      ctx.strokeStyle = 'rgba(217,196,138,.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(d.x, sy - 200); ctx.lineTo(d.x, sy - 12); ctx.stroke();
      Sprites.draw(ctx, 'stone', d.x, sy, 1.6);
    }
    // 만세 함성 파동
    for (const w of G.waves) {
      if (w.r <= 6) continue;          // 두 번째 파동은 안쪽에서 출발하므로 반지름이 음수가 되지 않게 건너뛴다
      const k = 1 - w.r / w.maxR;
      ctx.strokeStyle = `rgba(255,243,176,${0.85 * k})`;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(209,48,58,${0.5 * k})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r - 5, 0, Math.PI * 2); ctx.stroke();
    }

    // 청동 거울
    if (G.weapons.mirror) {
      const s = UPGRADES.mirror.stat(G.weapons.mirror);
      for (let i = 0; i < s.n; i++) {
        const a = G.mirrorAng + i / s.n * Math.PI * 2;
        const mx = p.x + Math.cos(a) * s.rad, my = p.y + Math.sin(a) * s.rad;
        ctx.fillStyle = 'rgba(120, 200, 190, .25)';
        ctx.beginPath(); ctx.arc(mx, my, 16, 0, Math.PI * 2); ctx.fill();
        Sprites.draw(ctx, 'mirror', mx, my, 1.15, G.t * 0.6 + i / s.n);
      }
    }

    // 효과
    for (const f of G.fx) {
      const k = f.life / f.max;
      if (f.k === 'slash') {
        ctx.save();
        ctx.globalAlpha = k;
        const x0 = f.dir > 0 ? f.x : f.x - f.w;
        const grad = ctx.createLinearGradient(x0, 0, x0 + f.w, 0);
        grad.addColorStop(f.dir > 0 ? 0 : 1, 'rgba(255,255,255,0)');
        grad.addColorStop(f.dir > 0 ? 1 : 0, 'rgba(230,240,255,.9)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(f.x + f.dir * f.w / 2, f.y, f.w / 2, f.h / 2 * (0.4 + 0.6 * k), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (f.k === 'ring') {
        ctx.strokeStyle = `rgba(255, 215, 110, ${k})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.05 - 0.35 * k), 0, Math.PI * 2); ctx.stroke();
      } else if (f.k === 'boom') {
        ctx.fillStyle = `rgba(255, ${Math.floor(140 + 80 * k)}, 60, ${0.55 * k})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.1 - 0.4 * k), 0, Math.PI * 2); ctx.fill();
      } else if (f.k === 'dust') {
        ctx.fillStyle = `rgba(170,140,100,${0.5 * k})`;
        ctx.beginPath(); ctx.ellipse(f.x, f.y + 4, f.r * (1.15 - 0.3 * k), f.r * 0.45 * (1.15 - 0.3 * k), 0, 0, Math.PI * 2); ctx.fill();
      } else if (f.k === 'smoke') {
        ctx.fillStyle = `rgba(200,200,200,${0.35 * k})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, (3 + (1 - k) * 4) * (f.big ? 2.2 : 1), 0, Math.PI * 2); ctx.fill();
      }
    }

    // 피해 숫자
    ctx.font = 'bold 13px "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,.8)';
    for (const t of G.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 3);
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 화면 밖 보스·보물상자 방향 표시
    for (const e of G.enemies) if (e.boss) drawPointer(e.x - cx, e.y - cy, '#ff4b3a');
    for (const it of G.items) if (it.kind === 'chest') drawPointer(it.x - cx, it.y - cy, '#ffd34d');

    // 가상 조이스틱
    if (joy.active) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 50, 0, Math.PI * 2); ctx.stroke();
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy), m = Math.min(d, 50) / (d || 1);
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.beginPath(); ctx.arc(joy.ox + dx * m, joy.oy + dy * m, 20, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPointer(sx, sy, color) {
    const m = 30;
    if (sx > m && sx < VW - m && sy > 70 && sy < VH - m) return;
    const x = clamp(sx, m, VW - m), y = clamp(sy, 80, VH - m);
    const a = Math.atan2(sy - VH / 2, sx - VW / 2);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  // ── HUD ───────────────────────────────────────────────
  const hud = {
    era: $('hud-era'), time: $('hud-time'), kills: $('hud-kills'), quiz: $('hud-quiz'),
    xp: $('xpfill'), lv: $('lvtext'), hp: $('hpfill'), hpText: $('hptext'), inv: $('inv'),
  };
  const lastHud = {};
  function setText(el, key, v) { if (lastHud[key] !== v) { lastHud[key] = v; el.textContent = v; } }
  function updateHud() {
    const p = G.player;
    setText(hud.time, 'time', fmtTime(Math.max(0, GOAL - G.t)));
    setText(hud.kills, 'kills', `💀 ${G.kills}`);
    setText(hud.quiz, 'quiz', `📖 ${G.quizRight} / ${G.quizTotal}`);
    setText(hud.lv, 'lv', `Lv ${G.level}`);
    setText(hud.hpText, 'hp', `${Math.ceil(p.hp)} / ${p.maxHp}`);
    hud.xp.style.width = `${clamp(G.xp / G.xpNeed, 0, 1) * 100}%`;
    hud.hp.style.width = `${clamp(p.hp / p.maxHp, 0, 1) * 100}%`;
  }
  function updateHudEra() { setText(hud.era, 'era', `${ERAS[G.era].name} (${G.era + 1}/${G.eraCount})`); }
  function iconHtml(id) {
    const u = UPGRADES[id];
    return u.icon ? `<img class="px-icon" src="${Sprites.iconURL(u.icon)}" alt="">` : u.emoji;
  }
  function invHtml(withNames) {
    const list = [
      ...Object.keys(G.weapons).map(id => [id, G.weapons[id], 'weapon']),
      ...Object.keys(G.passives).map(id => [id, G.passives[id], 'passive']),
    ];
    return list.map(([id, lv, cls]) => withNames
      ? `<span class="inv-item ${cls}">${iconHtml(id)} ${UPGRADES[id].name} Lv${lv}</span>`
      : `<div class="inv-item ${cls}" title="${UPGRADES[id].name}">${iconHtml(id)}<b>${lv}</b></div>`).join('');
  }
  function updateInv() { hud.inv.innerHTML = invHtml(false); }

  let bannerTimer = null;
  function showBanner(title, sub, warn = false) {
    const b = $('banner');
    b.classList.add('hidden');
    void b.offsetWidth; // 애니메이션 재시작
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub || '';
    b.classList.toggle('warn', warn);
    b.classList.remove('hidden');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.add('hidden'), 2700);
  }

  // ── 화면 전환 ─────────────────────────────────────────
  const SCREENS = ['screen-title', 'screen-quiz', 'screen-upgrade', 'screen-pause', 'screen-over'];
  function showScreen(id) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  }

  function startGame() {
    SFX.ensure();
    newGame();
    state = 'play';
    showScreen(null);
    $('hud').classList.remove('hidden');
    for (const k in lastHud) delete lastHud[k];
    updateInv();
    lastTime = performance.now();
  }

  function pauseGame() {
    if (state !== 'play') return;
    state = 'paused';
    joy.active = false;
    $('pause-inv').innerHTML = invHtml(true);
    showScreen('screen-pause');
  }
  function resumeGame() {
    if (state !== 'paused') return;
    state = 'play';
    showScreen(null);
    lastTime = performance.now();
  }
  function goTitle() {
    state = 'title';
    G = null;
    $('hud').classList.add('hidden');
    $('banner').classList.add('hidden');
    showScreen('screen-title');
  }

  // ── 퀴즈 ──────────────────────────────────────────────
  let quiz = null;
  let quizTimerId = null;

  function pickQuestion() {
    const all = window.QUESTIONS.map((q, i) => ({ ...q, id: i }));
    const byLevel = all.filter(q => level >= 2 || q.lv === 1);
    const avail = byLevel.filter(q => q.era <= G.era);
    let pool = avail.filter(q => !G.usedQ.has(q.id));
    if (!pool.length) {
      for (const q of avail) G.usedQ.delete(q.id);
      pool = avail;
    }
    const current = pool.filter(q => q.era === G.era);
    const q = current.length && Math.random() < 0.6 ? pick(current) : pick(pool);
    G.usedQ.add(q.id);
    return q;
  }

  function openQuiz() {
    state = 'quiz';
    joy.active = false;
    const q = pickQuestion();
    const ox = q.c.length === 2;
    const order = ox ? [0, 1] : shuffle(q.c.map((_, i) => i));   // ○× 문제는 순서를 그대로 둔다
    quiz = { q, order, answered: false, correct: false };
    $('quiz-tag').textContent = `레벨 업! Lv ${G.level}`;
    $('quiz-era').textContent = `${ERAS[q.era].name} · ${q.std}`;
    $('quiz-choices').classList.toggle('ox', ox);
    $('quiz-q').textContent = q.q;
    const box = $('quiz-choices');
    box.innerHTML = '';
    order.forEach((ci, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<span class="num">${i + 1}</span><span class="txt">${escapeHtml(q.c[ci])}</span>`;
      b.addEventListener('click', () => answerQuiz(i));
      box.appendChild(b);
    });
    $('quiz-result').classList.add('hidden');
    showScreen('screen-quiz');

    // 도전: 제한 시간 15초
    const timerEl = $('quiz-timer');
    clearInterval(quizTimerId);
    if (level >= 2) {
      let left = 15;
      timerEl.textContent = `⏱ ${left}초`;
      timerEl.classList.remove('hidden');
      quizTimerId = setInterval(() => {
        left--;
        timerEl.textContent = `⏱ ${left}초`;
        if (left <= 0) { clearInterval(quizTimerId); answerQuiz(-1); }
      }, 1000);
    } else {
      timerEl.classList.add('hidden');
    }
  }

  function answerQuiz(i) {
    if (!quiz || quiz.answered) return;
    clearInterval(quizTimerId);
    quiz.answered = true;
    const { q, order } = quiz;
    const correct = i >= 0 && order[i] === q.a;
    quiz.correct = correct;
    G.quizTotal++;
    if (correct) G.quizRight++;
    else G.wrongNote.push(q);
    const st = G.stdStats[q.std] || (G.stdStats[q.std] = { right: 0, total: 0 });
    st.total++;
    if (correct) st.right++;
    const btns = $('quiz-choices').children;
    for (let k = 0; k < btns.length; k++) {
      btns[k].disabled = true;
      if (order[k] === q.a) btns[k].classList.add('correct');
      else if (k === i) btns[k].classList.add('wrong');
    }
    const v = $('quiz-verdict');
    v.textContent = correct ? '⭕ 정답! 강화 3개 중 하나를 고르세요' : (i < 0 ? '⏱ 시간 초과!' : '❌ 오답!') + ' 강화는 1개만 주어져요';
    v.className = correct ? 'good' : 'bad';
    $('quiz-exp').textContent = (correct ? '' : `정답: ${q.c[q.a]} — `) + q.exp;
    $('quiz-result').classList.remove('hidden');
    correct ? SFX.right() : SFX.wrong();
    $('quiz-next').focus();
  }

  function afterQuiz() {
    if (!quiz || !quiz.answered) return;
    const correct = quiz.correct;
    quiz = null;
    if (correct) {
      const p = G.player;
      p.hp = Math.min(p.maxHp, p.hp + 20);
    }
    openUpgrade(correct ? 3 : 1, correct ? '⭕ 정답 보상 — 체력 +20, 강화를 골라 주세요' : '❌ 오답 — 남은 강화 1개를 받으세요');
  }

  // ── 강화 선택 ─────────────────────────────────────────
  function upgradeOptions(n) {
    const cands = Object.keys(UPGRADES).filter(id => lvOf(id) < MAX_LV);
    // 무기가 적을 때는 새 무기가 조금 더 잘 나오도록
    const weighted = [];
    for (const id of cands) {
      const isNewWeapon = UPGRADES[id].type === 'w' && !G.weapons[id];
      const w = isNewWeapon && Object.keys(G.weapons).length < 3 ? 3 : lvOf(id) > 0 ? 2 : 1;
      for (let i = 0; i < w; i++) weighted.push(id);
    }
    shuffle(weighted);
    const out = [];
    for (const id of weighted) { if (!out.includes(id)) out.push(id); if (out.length >= n) break; }
    if (!out.length) out.push('heal');
    return out;
  }

  function openUpgrade(n, title, isChest = false) {
    state = 'upgrade';
    joy.active = false;
    $('up-title').textContent = title;
    const box = $('up-cards');
    box.innerHTML = '';
    upgradeOptions(n).forEach((id, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      if (id === 'heal') {
        b.innerHTML = `<div class="emoji"><img class="px-icon" src="${Sprites.iconURL('songpyeon')}" alt=""></div><div class="name">송편</div><div class="desc">모든 강화를 마쳤어요! 체력을 모두 회복합니다.</div><div class="key">[${i + 1}]</div>`;
      } else {
        const u = UPGRADES[id], lv = lvOf(id);
        const desc = u.type === 'w' ? u.desc[lv] : u.desc[0];
        b.innerHTML = `<div class="emoji">${iconHtml(id)}</div>
          <div class="name">${u.name}</div>
          <div class="lv ${lv ? '' : 'new'}">${lv ? `Lv ${lv} → ${lv + 1}` : 'NEW'}</div>
          <div class="desc">${desc}</div>
          <div class="tip">💡 ${u.tip}</div>
          <div class="key">[${i + 1}]</div>`;
      }
      b.addEventListener('click', () => chooseUpgrade(id));
      box.appendChild(b);
    });
    if (isChest) SFX.right();
    showScreen('screen-upgrade');
  }

  function chooseUpgrade(id) {
    if (state !== 'upgrade') return;
    if (id === 'heal') G.player.hp = G.player.maxHp;
    else if (UPGRADES[id].type === 'w') G.weapons[id] = (G.weapons[id] || 0) + 1;
    else { G.passives[id] = (G.passives[id] || 0) + 1; recomputeStats(); }
    updateInv();
    state = 'play';
    showScreen(null);
    lastTime = performance.now();
    checkPending();
  }

  // ── 게임 종료 ─────────────────────────────────────────
  function endGame(win) {
    state = 'over';
    joy.active = false;
    $('over-title').textContent = win ? '🏆 생존 성공!' : '💀 쓰러졌습니다';
    $('over-sub').textContent = win
      ? `${ERAS[0].name}부터 ${ERAS[G.eraCount - 1].name}까지 모든 시대를 지켜 냈어요!`
      : `${ERAS[Math.max(0, G.era)].name}에서 쓰러졌어요. 다시 도전해 보세요!`;
    const rate = G.quizTotal ? Math.round(G.quizRight / G.quizTotal * 100) : 0;
    $('over-stats').innerHTML = `
      <div>캐릭터<b>${G.hero.name}</b></div>
      <div>생존 시간<b>${fmtTime(G.t)}</b></div>
      <div>도달 레벨<b>Lv ${G.level}</b></div>
      <div>처치한 적<b>${G.kills}</b></div>
      <div>쓰러뜨린 보스<b>${G.bossesKilled}</b></div>
      <div>퀴즈 정답률<b>${G.quizRight}/${G.quizTotal} (${rate}%)</b></div>`;
    const stds = Object.keys(G.stdStats).sort();
    $('over-std').innerHTML = stds.map(k => {
      const st = G.stdStats[k], pct = Math.round(st.right / st.total * 100);
      return `<div class="std-row"><span>[${k}]</span><span class="bar"><i style="width:${pct}%"></i></span><b>${st.right}/${st.total}</b></div>`;
    }).join('');
    $('over-std-wrap').classList.toggle('hidden', !stds.length);
    const note = $('over-note');
    if (G.wrongNote.length) {
      note.innerHTML = G.wrongNote.map(q =>
        `<div><b>[${ERAS[q.era].name} · ${q.std}]</b> ${escapeHtml(q.q)}<br><span class="ans">정답: ${escapeHtml(q.c[q.a])}</span> — ${escapeHtml(q.exp)}</div>`).join('');
      $('over-note-wrap').classList.remove('hidden');
    } else {
      $('over-note-wrap').classList.add('hidden');
    }
    showScreen('screen-over');
  }

  // ── 버튼 연결 ─────────────────────────────────────────
  function syncUrl() {
    const u = new URL(location.href);
    u.searchParams.set('g', 'history-survivor');
    u.searchParams.set('m', 'solo');
    u.searchParams.set('grade', '5');
    u.searchParams.set('unit', unit);
    u.searchParams.set('lv', level);
    try { history.replaceState(null, '', u); } catch (e) { /* file:// 등에서는 무시 */ }
  }
  function setUnit(v) {
    unit = v;
    for (const b of $('unit-btns').children) b.classList.toggle('on', +b.dataset.unit === v);
    const eras = ERAS.filter(e => e.unit <= v);
    $('unit-desc').textContent = `${UNITS[v].desc}\n${eras.map(e => e.name).join(' → ')}`;
    syncUrl();
  }
  function setLevel(v) {
    level = v;
    for (const b of $('level-btns').children) b.classList.toggle('on', +b.dataset.level === v);
    $('level-desc').textContent = v === 1 ? '교과서 핵심 문제만 나와요.' : '더 깊은 문제까지 나오고, 문제마다 15초 제한 시간이 있어요.';
    syncUrl();
  }
  for (const b of $('unit-btns').children) b.addEventListener('click', () => setUnit(+b.dataset.unit));
  for (const b of $('level-btns').children) b.addEventListener('click', () => setLevel(+b.dataset.level));
  setUnit(unit);
  setLevel(level);

  // 캐릭터 선택
  const heroList = $('hero-list');
  for (const h of HEROES) {
    const b = document.createElement('button');
    b.className = 'hero-btn';
    b.dataset.hero = h.id;
    b.innerHTML = `<canvas></canvas><span>${h.name}</span>`;
    b.addEventListener('click', () => setHero(h.id));
    heroList.appendChild(b);
  }
  function setHero(id) {
    const h = heroById(id);
    heroId = h.id;
    try { localStorage.setItem('hs-hero', h.id); } catch (e) { /* 무시 */ }
    for (const b of heroList.children) b.classList.toggle('on', b.dataset.hero === h.id);
    $('hero-name').textContent = h.name;
    $('hero-title').textContent = h.title;
    $('hero-desc').textContent = h.desc;
    $('hero-weapon').innerHTML = `시작 무기 ${iconHtml(h.start)} ${UPGRADES[h.start].name}`;
    $('hero-perk').textContent = `특성 · ${h.perk}`;
  }
  function drawHeroPortraits(t) {
    for (const b of heroList.children) {
      const on = b.dataset.hero === heroId;
      const c = b.firstChild;
      if (!c.drawn || on || c.wasOn) {
        Sprites.portrait(c, b.dataset.hero, on ? (t * 1.6) % 1 : 0);
        c.drawn = true;
        c.wasOn = on;
      }
    }
    Sprites.portrait($('hero-portrait'), heroId, (t * 1.6) % 1);
  }
  setHero(heroId);

  $('btn-start').addEventListener('click', startGame);
  $('btn-retry').addEventListener('click', startGame);
  $('btn-home').addEventListener('click', goTitle);
  $('btn-quit').addEventListener('click', goTitle);
  $('btn-resume').addEventListener('click', resumeGame);
  $('btn-pause').addEventListener('click', () => (state === 'play' ? pauseGame() : resumeGame()));
  $('btn-mute').addEventListener('click', e => { e.currentTarget.textContent = SFX.toggle() ? '🔇' : '🔊'; });
  $('quiz-next').addEventListener('click', afterQuiz);

  // ── 메인 루프 ─────────────────────────────────────────
  let lastTime = performance.now();
  let lastPortrait = 0;
  let frameErrors = 0;
  function frame(now) {
    // 다음 프레임을 먼저 예약해 두면, 이번 프레임에서 예외가 나도 게임이 멈추지 않는다
    requestAnimationFrame(frame);
    // rAF 타임스탬프가 startGame의 performance.now()보다 이를 수 있으므로 음수 방지
    const dt = clamp((now - lastTime) / 1000, 0, 0.05);
    lastTime = now;
    try {
      if (state === 'play') update(dt);
      render();
      if (G) updateHud();
      if (state === 'title' && now - lastPortrait > 90) { lastPortrait = now; drawHeroPortraits(now / 1000); }
    } catch (err) {
      if (frameErrors++ < 5) console.error(err);
      ctx.restore?.();
    }
  }
  requestAnimationFrame(frame);

  // 테스트·디버그용
  window.HistorySurvivor = { get state() { return state; }, get game() { return G; }, update };
})();
