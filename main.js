// 主页脚本：中英切换、入场动画（逐帧手绘 / 线条沸腾）和首屏右上角那颗飘落的种子。
// 两处共用一个笔刷：沿中心线取样，按“起笔细、行笔粗、收笔尖”向两侧偏移，拼成填充多边形；
// 每条线预先算 3 组轻微错位的版本，按每秒 12 帧（一拍二）轮换，就是线条沸腾。
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const FRAME = 83;                                  // 一拍二：每 83ms 换一帧，即每秒 12 帧
  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = x => Math.max(0, Math.min(1, x));
  const ease = x => .5 - .5 * Math.cos(Math.PI * clamp(x));
  const f = x => x.toFixed(1);
  const tick = () => Math.floor(performance.now() / FRAME) * FRAME;
  const make = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.append(e);
    return e;
  };

  // ---------- 中英切换 ----------
  // 中文写在元素里，英文写在 data-en（文字）、data-en-label（aria-label）、data-en-title（title）、
  // data-en-content（meta）里；第一次切换前把中文原文存进对应的 data-zh*。.alt 是另一种语言的副标题。
  const i18n = () => {
    const swaps = [['[data-en]', null, 'en', 'zh'], ['[data-en-label]', 'aria-label', 'enLabel', 'zhLabel'],
      ['[data-en-title]', 'title', 'enTitle', 'zhTitle'], ['[data-en-content]', 'content', 'enContent', 'zhContent']];
    const apply = lang => {
      const en = lang === 'en';
      root.lang = en ? 'en' : 'zh-CN';
      for (const [selector, attr, enKey, zhKey] of swaps) {
        for (const el of document.querySelectorAll(selector)) {
          if (!(zhKey in el.dataset)) el.dataset[zhKey] = attr ? el.getAttribute(attr) || '' : el.textContent;
          const text = el.dataset[en ? enKey : zhKey];
          if (attr) el.setAttribute(attr, text);
          else el.textContent = text;
        }
      }
      for (const el of document.querySelectorAll('.alt')) el.lang = en ? 'zh-CN' : 'en';
      root.classList.remove('i18n-pending');
    };
    apply(root.lang === 'en' ? 'en' : 'zh');
    const toggle = document.querySelector('.lang-toggle');
    if (toggle) toggle.addEventListener('click', () => {
      const next = root.lang === 'en' ? 'zh' : 'en';
      apply(next);
      try { localStorage.setItem('lang', next); } catch (e) {}
    });
  };

  // ---------- 笔刷 ----------
  const brush = (svg, group, d, width, start = 0, dur = 0, erase = 0) => {
    const probe = make('path', { d, fill: 'none' }, svg);
    const len = probe.getTotalLength(), n = Math.max(8, Math.ceil(len / 2.5));
    const pts = Array.from({ length: n + 1 }, (_, i) => probe.getPointAtLength(len * i / n));
    probe.remove();
    const variants = [0, 1, 2].map(v => pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)];
      const k = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = (a.y - b.y) / k, ny = (b.x - a.x) / k;
      const wob = .7 * (.6 * Math.sin(i * .35 + v * 2.1) + .4 * Math.sin(i * .11 + v * 4.3));
      return { x: p.x + nx * wob, y: p.y + ny * wob, nx, ny, w: 1 + .08 * Math.sin(i * .5 + v * 1.7) };
    }));
    return { el: make('path', { class: 'brush' }, group), n, width, start, dur, erase, variants };
  };

  // 画出 [a, b] 这一段（0–1），两端收尖；v 是抖动版本。
  const outline = (s, a, b, v) => {
    const pts = s.variants[v], ia = Math.floor(a * s.n), ib = Math.ceil(b * s.n);
    if (ib - ia < 1) return '';
    const left = [], right = [];
    for (let i = ia; i <= ib; i++) {
      const u = i / s.n, p = pts[i];
      const pressure = u < .12 ? .3 + .7 * u / .12 : 1 - .55 * Math.max(0, (u - .7) / .3);
      const taper = Math.min(1, .35 + (ib - i) / 5) * Math.min(1, .35 + (i - ia) / 5);
      const h = s.width * pressure * taper * p.w / 2;
      left.push(`${f(p.x + p.nx * h)} ${f(p.y + p.ny * h)}`);
      right.push(`${f(p.x - p.nx * h)} ${f(p.y - p.ny * h)}`);
    }
    return `M${left.join('L')}L${right.reverse().join('L')}Z`;
  };

  // ---------- 入场动画 ----------
  // 毛笔画出蒲公英和姓名下划线 → 种子冒出 → 蓄力、气流扫过、种子吹散 → 揭开主页。
  // onReveal(played) 在揭开主页时调用；没有播放开场时立即调用。
  const intro = onReveal => {
    const screen = document.querySelector('.intro-screen');
    if (!root.classList.contains('intro')) {
      if (screen) screen.remove();
      return onReveal(false);
    }
    const BURST = 1900, REVEAL = 2300, END = 4300;   // 吹散、揭开主页、收尾的时刻（毫秒）
    const art = screen.querySelector('.intro-art'), ink = art.querySelector('.ink');
    const lineSvg = screen.querySelector('.intro-line'), name = screen.querySelector('.intro-name');
    const core = art.querySelector('.core'), C = { x: 204, y: 112 };
    const strokes = [
      brush(art, ink, 'M198 300C192 250 214 190 204 116', 5.5, 0, 700),                  // 茎
      brush(art, ink, 'M197 286C178 278 160 262 146 244', 9, 300, 450),                  // 左叶
      brush(art, ink, 'M199 280C218 270 234 256 246 238', 9, 380, 450),                  // 右叶
      brush(lineSvg, lineSvg.querySelector('.ink'), 'M20 12C90 6 200 16 280 9', 2.8, 1000, 500),
      brush(art, ink, 'M372 90C326 84 290 100 250 92', 3.4, 1560, 330, 170),             // 三道气流
      brush(art, ink, 'M392 126C342 120 304 136 262 126', 3.8, 1630, 330, 170),
      brush(art, ink, 'M366 160C326 154 300 166 268 158', 3, 1700, 330, 170)
    ];

    // 种子：一圈 25 颗，正下方接茎的位置空出来；朝右（迎着气流）的几颗留在原处，陶土色那颗飘得最远。
    const seedPath = () => {
      const j = () => (Math.random() - .5) * .9, tx = j(), ty = -33 + j();
      return `M${f(j())} ${f(-5 + j())}L${f(tx)} ${f(ty)}` +
        [[-5, -40], [-1.6, -42.5], [1.6, -42.5], [5, -40]].map(([x, y]) => `M${f(tx)} ${f(ty)}L${f(x + j())} ${f(y + j())}`).join('');
    };
    const seeds = [];
    for (let k = 0; k < 26; k++) {
      const a = k * 360 / 26 + rand(-4, 4);
      if (Math.abs(a - 180) < 9) continue;
      const stay = a > 60 && a < 125, clay = k === 19;
      const g = make('g', { class: stay ? 'stay' : '', style: 'opacity:0' }, art.querySelector('.seeds'));
      seeds.push({
        g, a, clay, stay, path: make('path', { class: clay ? 'seed clay' : 'seed' }, g),
        frames: [seedPath(), seedPath(), seedPath()], show: 700 + seeds.length * 28,
        delay: clay ? 200 : rand(0, 350), vx: clay ? -130 : rand(-440, -120), vy: rand(-280, -60), ph: rand(0, 6)
      });
    }

    const draw = (t, v) => {
      for (const s of strokes) {
        const b = ease((t - s.start) / s.dur), a = s.erase ? ease((t - s.start - s.erase) / s.dur) : 0;
        s.el.setAttribute('d', b > a ? outline(s, a, b, v) : '');
      }
      core.style.opacity = t >= 650 ? 1 : 0;
      name.style.opacity = Math.floor(clamp((t - 900) / 330) * 4) / 4;
      const squash = t >= 1650 && t < 1730 ? .93 : t >= 1730 && t < 1810 ? 1.05 : 1;   // 吹散前先缩一下蓄力
      for (const s of seeds) {
        if (t < s.show) continue;
        let x = C.x, y = C.y, rot = s.a, op = 1;
        const scale = Math.min(1, .6 + (t - s.show) / 200) * squash;
        const e = (t - BURST - s.delay) / 1000;
        if (!s.stay && e >= 0) {
          const r = s.a * Math.PI / 180, out = 22 * (1 - Math.exp(-e * 6));
          x += Math.sin(r) * out + s.vx * e + 6 * Math.sin(e * 5 + s.ph);
          y += -Math.cos(r) * out + s.vy * e + 4 * Math.cos(e * 4 + s.ph);
          rot = (s.a > 180 ? s.a - 360 : s.a) * Math.max(0, 1 - e / .6) + 14 * Math.sin(e * 3 + s.ph);
          op = 1 - clamp((e - (s.clay ? 1.6 : 1)) / .8);
        }
        s.g.setAttribute('transform', `translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(scale)})`);
        s.g.style.opacity = op;
        s.path.setAttribute('d', s.frames[v]);
      }
    };

    let revealed = false, raf = 0, last = -1;
    const t0 = performance.now();
    const reveal = skipped => {
      if (revealed) return;
      revealed = true;
      screen.classList.add('leaving');
      if (skipped) screen.classList.add('skipped');
      root.classList.remove('intro');
      try { sessionStorage.setItem('intro-seen', '1'); } catch (e) {}
      onReveal(true);
      if (skipped) setTimeout(() => { cancelAnimationFrame(raf); screen.remove(); }, 450);
    };
    const loop = now => {
      const t = now - t0, frame = Math.floor(t / FRAME);
      if (frame !== last) { last = frame; draw(frame * FRAME, frame % 3); }
      if (t >= REVEAL) reveal(false);
      if (t >= END) return screen.remove();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // 点击、按键、滚轮或在手机上滑动都算跳过。
    const skip = () => reveal(true);
    screen.addEventListener('click', skip);
    addEventListener('keydown', skip, { once: true });
    addEventListener('wheel', skip, { once: true, passive: true });
    addEventListener('touchmove', skip, { once: true, passive: true });
  };

  // ---------- 首屏右上角：飘落的种子 ----------
  // 开场被吹走的那颗陶土色种子，揭开主页后飘落下来，挂在冠毛下轻轻摆；点一下被吹走，过一会儿再飘来一颗。
  const landingSeed = () => {
    const btn = document.querySelector('.landing-seed');
    if (!btn) return () => {};
    const svg = btn.querySelector('svg'), body = svg.querySelector('.seed-body');
    const P = { x: 60, y: 46 };                      // 冠毛中心：摆动时绕这里转
    let strokes = [], state = 'hidden', since = 0, from = [0, 0, 0];

    // 每颗种子都略有不同：11 根冠毛从顶上散开、向外微弯，下面是细长的喙和瘦果。
    const grow = () => {
      body.replaceChildren();
      strokes = [];
      for (let i = 0; i < 11; i++) {
        const a = (-62 + i * 12.4 + rand(-4, 4)) * Math.PI / 180, len = rand(31, 38);
        const ex = P.x + Math.sin(a) * len, ey = P.y - Math.cos(a) * len;
        const cx = P.x + Math.sin(a * .7) * len * .6, cy = P.y - Math.cos(a * .7) * len * .6;
        strokes.push(brush(svg, body, `M${P.x} ${P.y}Q${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}`, 1.3));
      }
      strokes.push(brush(svg, body, 'M60 46C61.5 70 58.5 92 60 116', 1.9));
      strokes.push(brush(svg, body, 'M60 114C60.6 122 60.6 131 60 141', 5.4));
    };

    // 不同状态下的位置 [dx, dy, 旋转角, 不透明度]，全部按逐帧的时间 t 计算。
    const pose = t => {
      const e = t - since;
      if (state === 'landing') {
        // 从导航栏下方的留白里淡入，不从导航文字上划过。
        const k = clamp(e / 2400), q = ease(k);
        if (k >= 1) { state = 'idle'; since = t; }
        return [60 * (1 - q) + 14 * Math.sin(k * Math.PI * 2) * (1 - k), -120 * (1 - q),
          18 * (1 - k) * Math.sin(k * 7), clamp(k * 3.3)];
      }
      if (state === 'idle') return [0, 2.5 * Math.sin(e / 420), 4 * Math.sin(e / 520), 1];
      if (state === 'leaving') {
        const k = clamp(e / 1100), q = k * k * (3 - 2 * k);
        if (k >= 1) { state = 'gone'; since = t; }
        return [from[0] - 320 * q, from[1] - 200 * q - 20 * Math.sin(k * 6), from[2] - 50 * q, 1 - clamp((k - .5) / .5)];
      }
      if (state === 'gone' && e > 1400) { grow(); state = 'landing'; since = t; }
      return [0, 0, 0, 0];
    };
    const draw = t => {
      const [x, y, rot, op] = pose(t);
      body.setAttribute('transform', `translate(${f(x)} ${f(y)}) rotate(${f(rot)} ${P.x} ${P.y})`);
      body.style.opacity = op;
      const v = Math.floor(t / FRAME) % 3;
      for (const s of strokes) s.el.setAttribute('d', outline(s, 0, 1, v));
    };

    btn.addEventListener('click', () => {
      if (state !== 'idle') return;
      if (still) {
        body.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], { duration: 900 });
        setTimeout(() => { grow(); draw(since); }, 450);
        return;
      }
      const t = tick();
      from = pose(t).slice(0, 3);
      state = 'leaving';
      since = t;
    });

    return delay => {
      grow();
      if (still) { state = 'idle'; draw(since); return; }
      draw(0);
      setTimeout(() => { state = 'landing'; since = tick(); }, delay);
      let frame = -1, onScreen = true;
      new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(btn);
      const loop = now => {
        const k = Math.floor(now / FRAME);
        if (k !== frame && onScreen) { frame = k; draw(k * FRAME); }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    };
  };

  i18n();
  const startSeed = landingSeed();
  intro(played => startSeed(played ? 600 : 300));
})();
