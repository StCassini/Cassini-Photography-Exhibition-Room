/* =========================================================================
   Cassini — Exhibition Room
   动效与交互
   ========================================================================= */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp  = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DATA = window.EXHIBIT || [];

  const VH = () => window.innerHeight;

  /* ─────────────────────────────────────────────── 0 · 基础状态 */
  document.documentElement.classList.remove('is-loading');

  const chapters = $$('[data-chapter]');
  const railItems = $$('[data-rail]');
  const bgLayers = $$('.bg-stack__layer');

  const anchors = chapters.map(el => {
    const first = el.querySelector('.eyebrow') || el.querySelector('.display') || el;
    return { el, top: 0, h: 0, first };
  });

  /* ─────────────────────────────────────── 1 · 生成目录与画廊 */
  // 每个画廊里所有 plate 的扁平量表，供查看器翻页
  const PLATES = {};

  buildEntries();
  buildBoards();

  function buildEntries() {
    const host = $('[data-entries]');
    if (!host) return;

    host.innerHTML = DATA.map((t, i) => {
      const thumbs = t.plates.slice(0, 4).map(p =>
        `<img src="${p.file}" alt="" loading="lazy" decoding="async" width="80" height="50">`
      ).join('');
      const yearLine = t.years || '—';
      return `
      <a class="entry" href="#${t.slug}" data-jump="${t.slug}" data-rv style="--d:${i * 110}ms">
        <span class="entry__main">
          <span class="entry__num"><b>${String(i + 1).padStart(2, '0')}</b> — ${t.count} plates${t.years ? ' · ' + t.years : ''}</span>
          <span class="entry__title">${t.title}</span>
          <span class="entry__sub">${t.dir}</span>
        </span>
        <span class="entry__thumbs">${thumbs}</span>
        <span class="entry__arrow" aria-hidden="true">
          <svg width="26" height="12" viewBox="0 0 26 12" fill="none"><path d="M0 6h24M24 6l-5.5-5M24 6l-5.5 5" stroke="currentColor" stroke-width="1.1"/></svg>
        </span>
      </a>`;
    }).join('');
  }

  /* 浮动图板：图片铺在一块画布上，缓慢漂移；鼠标靠近被推开，指到的那张放大。
     点击由全局 click 处理器接管，直接开全屏查看器。 */
  const FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function hash01(i, salt) {
    const x = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function buildBoards() {
    $$('.board[data-board]').forEach(board => {
      const slug = board.dataset.board;
      const set = DATA.find(t => t.slug === slug);
      if (!set) return;

      PLATES[slug] = set.plates;

      board.innerHTML = set.plates.map((p, i) => `
        <figure class="plate" data-slug="${slug}" data-i="${i}" tabindex="0" role="button"
                aria-label="查看 ${set.title} 第 ${p.n} 张，共 ${set.count} 张">
          <span class="plate__ph" style="background-image:url('data:image/webp;base64,${p.lqip}')"></span>
          <img src="${p.file}" alt="${set.title} — plate ${p.n}" width="${p.w}" height="${p.h}"
               loading="lazy" decoding="async">
          <span class="plate__idx">${String(p.n).padStart(2, '0')} / ${set.count}</span>
          <figcaption class="plate__cap">
            <span>Plate ${String(p.n).padStart(2, '0')}</span><i>${p.w}×${p.h}</i>
          </figcaption>
        </figure>`).join('');

      $$('.plate', board).forEach(fig => {
        const img = fig.querySelector('img');
        const done = () => fig.classList.add('is-ready');
        if (img.complete && img.naturalWidth) done();
        else img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });

      initBoard(board);
    });

    // 计数角标按真实数量纠正
    DATA.forEach(t => {
      const el = $(`[data-count="${t.slug}"]`);
      if (el) el.textContent = t.count;
    });
  }

  function initBoard(board) {
    const els = $$('.plate', board);
    const n = els.length;
    if (!n) return;

    const items = els.map((el, i) => ({
      el, i,
      ax: 0, ay: 0,        // 基准位置
      x: 0, y: 0,          // 当前位置
      w: 180, h: 113,
      rot: 0, rc: 0,       // 目标/当前旋转
      s: 1,
      phase: (i * 2.39996) % 6.28318,
      z: 10 + i,
      jx: hash01(i, 1),
      jy: hash01(i, 2),
      jr: hash01(i, 3)
    }));

    const st = {
      mx: -9999, my: -9999, cx: -9999, cy: -9999, on: false, hover: -1,
      rect: board.getBoundingClientRect(),
      raf: 0, visible: false, t0: performance.now()
    };

    function apply(it) {
      it.el.style.transform =
        'translate3d(' + it.x.toFixed(2) + 'px,' + it.y.toFixed(2) + 'px,0)' +
        ' rotate(' + it.rc.toFixed(2) + 'deg) scale(' + it.s.toFixed(3) + ')';
    }

    function layout() {
      const W = board.clientWidth;
      if (!W) return;

      const cols = W < 560 ? 3 : W < 900 ? 4 : 6;
      const rows = Math.ceil(n / cols);
      const cellW = W / cols;
      const cellH = Math.max(92, cellW * 0.575 + 30);
      const pw = Math.round(cellW * 0.84);
      const ph = Math.round(pw * 0.625);

      board.style.setProperty('--pw', pw + 'px');
      board.style.setProperty('--ph', ph + 'px');
      board.style.height = (rows * cellH + 12) + 'px';

      items.forEach((it, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        it.w = pw; it.h = ph;
        it.ax = col * cellW + (cellW - pw) / 2 + (it.jx - 0.5) * cellW * 0.18;
        it.ay = row * cellH + (cellH - ph) / 2 + (it.jy - 0.5) * cellH * 0.16;
        it.rot = (it.jr - 0.5) * 9;
        it.rc = it.rot;
        it.x = it.ax;
        it.y = it.ay;
        it.s = 1;
        it.el.style.setProperty('--d', (row * 70 + col * 35) + 'ms');
        it.el.style.zIndex = it.z;
        apply(it);
      });
    }

    function hitTest() {
      // 先看是否还在当前悬停项的放大后范围内，避免边缘抖动
      const cur = st.hover >= 0 ? items[st.hover] : null;
      if (cur) {
        const cx = cur.ax + cur.w / 2, cy = cur.ay + cur.h / 2;
        const hw = cur.w * cur.s / 2, hh = cur.h * cur.s / 2;
        if (st.mx >= cx - hw && st.mx <= cx + hw && st.my >= cy - hh && st.my <= cy + hh) return st.hover;
      }
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (st.mx >= it.ax && st.mx <= it.ax + it.w && st.my >= it.ay && st.my <= it.ay + it.h) return i;
      }
      return -1;
    }

    function frame(now) {
      if (!st.visible) { st.raf = 0; return; }
      const t = now - st.t0;

      // 指针存的是视口坐标，每帧换算成画板内坐标：
      // 这样滚轮滚动时悬停状态会跟着一起走，不会卡在一张图上。
      const insideBoard = st.cx >= st.rect.left && st.cx <= st.rect.right &&
                          st.cy >= st.rect.top && st.cy <= st.rect.bottom;
      const active = FINE && st.on && !REDUCED && insideBoard;
      if (active) {
        st.mx = st.cx - st.rect.left;
        st.my = st.cy - st.rect.top;
      }

      const hover = active ? hitTest() : -1;
      if (hover !== st.hover) {
        for (let i = 0; i < items.length; i++) {
          const on = i === hover;
          items[i].el.classList.toggle('is-hover', on);
          items[i].el.style.zIndex = on ? 900 : items[i].z;
        }
        st.hover = hover;
      }

      const R = Math.max(160, Math.min(300, board.clientWidth / 4.3));
      const PUSH = R * 0.30;

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        let tx = it.ax, ty = it.ay, ts = 1, tr = it.rot;

        if (!REDUCED) {
          tx += Math.sin(t * 0.00042 + it.phase) * 8.5;
          ty += Math.cos(t * 0.00055 + it.phase * 1.6) * 6.5;
          tr += Math.sin(t * 0.00031 + it.phase * 2.3) * 0.9;
        }

        if (active) {
          if (i === hover) {
            ts = 1.62;
            tr = 0;
          } else {
            const cx = it.ax + it.w / 2, cy = it.ay + it.h / 2;
            const dx = cx - st.mx, dy = cy - st.my;
            const d2 = dx * dx + dy * dy;
            if (d2 < R * R) {
              const d = Math.sqrt(d2) || 1;
              const f = 1 - d / R;
              const push = f * f * PUSH;
              tx += (dx / d) * push;
              ty += (dy / d) * push;
              ts = 1 - f * 0.07;
            }
          }
        }

        const k = REDUCED ? 1 : 0.14;
        it.x += (tx - it.x) * k;
        it.y += (ty - it.y) * k;
        it.s += (ts - it.s) * 0.16;
        it.rc += (tr - it.rc) * 0.15;
        apply(it);
      }

      st.raf = requestAnimationFrame(frame);
    }

    const refreshRect = () => { st.rect = board.getBoundingClientRect(); };

    board.addEventListener('pointermove', e => {
      if (!FINE || REDUCED) return;
      st.cx = e.clientX;
      st.cy = e.clientY;
      st.on = true;
      // 指针移动时才读一次几何，避免每帧强制回流
      st.rect = board.getBoundingClientRect();
    }, { passive: true });

    board.addEventListener('pointerleave', () => {
      st.on = false;
      st.cx = -9999; st.cy = -9999;
      st.mx = -9999; st.my = -9999;
    });

    window.addEventListener('scroll', refreshRect, { passive: true });

    new IntersectionObserver(es => {
      st.visible = es[0].isIntersecting;
      if (st.visible && !st.raf) st.raf = requestAnimationFrame(frame);
    }, { threshold: 0.01 }).observe(board);

    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { layout(); refreshRect(); }, 170);
    });

    layout();
    st.raf = requestAnimationFrame(frame);
  }

  /* ─────────────────────────────────── 2 · 入场揭示 */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.02, rootMargin: '0px 0px -28px 0px' });

  function revealInView() {
    const vh = VH();
    $$('[data-rv], .display, .plate').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.97 && r.bottom > 0) el.classList.add('is-in');
    });
  }

  function observeAll() {
    $$('[data-rv], .display, .plate').forEach(el => {
      if (!el.classList.contains('is-in')) io.observe(el);
    });
  }
  observeAll();

  /* ─────────────────────────────────── 3 · 背景色连续过渡 */
  let pSmooth = 0;
  let pTarget = 0;
  let lastLayers = [-1, -1, -1, -1, -1, -1];

  function measure() {
    anchors.forEach(a => {
      a.top = a.el.getBoundingClientRect().top + window.scrollY;
      a.h = a.el.offsetHeight;
    });
  }
  measure();

  function indexAt(offset) {
    const y = window.scrollY + VH() * offset;
    let i = 0;
    for (let k = 0; k < anchors.length; k++) if (anchors[k].top <= y) i = k;
    return i;
  }

  const activeIndex = () => indexAt(0.55);

  // 墨色比导航高亮更早一点切换：等到黄底基本铺满再翻成黑字
  let inkIdx = -1;
  function setInk(idx) {
    if (idx === inkIdx) return;
    inkIdx = idx;
    const ink = chapters[idx] && chapters[idx].getAttribute('data-ink');
    document.documentElement.setAttribute('data-ink', ink === 'dark' ? 'dark' : 'light');
  }

  function computeBlend() {
    // 颜色在「下一章进入视口 85%」到「占满 25% 以上」之间走完
    const y = window.scrollY + VH() * 0.25;
    const win = VH() * 0.6;
    let i = 0;
    for (let k = 0; k < anchors.length; k++) if (anchors[k].top <= y) i = k;

    const next = anchors[i + 1];
    let frac = 0;
    if (next) frac = smooth(clamp(1 - (next.top - y) / win, 0, 1));
    return i + frac;
  }

  function paintLayers(p) {
    const fi = Math.floor(p);
    const fr = p - fi;
    for (let k = 0; k < bgLayers.length; k++) {
      let op;
      if (k === 0) op = 1;
      else if (k <= fi) op = 1;
      else if (k === fi + 1) op = fr;
      else op = 0;
      op = Math.round(op * 1000) / 1000;
      if (op !== lastLayers[k]) {
        bgLayers[k].style.opacity = op;
        lastLayers[k] = op;
      }
    }
  }

  /* ─────────────────────────────────── 4 · 导航轨 + 连线 */
  const svg = $('.wires');
  const SVGNS = 'http://www.w3.org/2000/svg';
  let activeIdx = -1;
  let wireGroup = null, wirePath = null, wirePulse = null, wireNode = null;

  function initWire() {
    if (!svg) return;
    svg.innerHTML = '';
    wireGroup = document.createElementNS(SVGNS, 'g');
    wireGroup.setAttribute('opacity', '0');
    wireGroup.style.transition = 'opacity .5s cubic-bezier(.33,0,.2,1)';

    wirePath = document.createElementNS(SVGNS, 'path');
    wirePath.setAttribute('class', 'wire');
    wireGroup.appendChild(wirePath);

    wirePulse = document.createElementNS(SVGNS, 'path');
    wirePulse.setAttribute('class', 'wire-pulse');
    wireGroup.appendChild(wirePulse);

    wireNode = document.createElementNS(SVGNS, 'circle');
    wireNode.setAttribute('class', 'wire-node');
    wireNode.setAttribute('r', '1.7');
    wireGroup.appendChild(wireNode);

    svg.appendChild(wireGroup);
  }
  initWire();

  function updateWire() {
    if (!wireGroup || activeIdx < 0 || window.innerWidth < 901) {
      if (wireGroup) wireGroup.setAttribute('opacity', '0');
      return;
    }
    const item = railItems[activeIdx];
    const a = anchors[activeIdx];
    if (!item || !a) return;

    const ir = item.getBoundingClientRect();
    const ar = a.first.getBoundingClientRect();

    const sx = ir.right - 8;
    const sy = ir.top + ir.height / 2;
    const tx = Math.max(ar.left - 12, 140);
    const ty = ar.top + Math.min(ar.height / 2, 18);

    const dy = Math.abs(ty - sy);
    const op = clamp(1 - (dy - 34) / 190, 0, 1);
    if (op <= 0.02) { wireGroup.setAttribute('opacity', '0'); return; }

    const k = Math.max(14, (tx - sx) * 0.55);
    const d = `M ${sx} ${sy} C ${sx + k} ${sy}, ${tx - k} ${ty}, ${tx} ${ty}`;

    wirePath.setAttribute('d', d);
    wirePulse.setAttribute('d', d);
    wireNode.setAttribute('cx', tx);
    wireNode.setAttribute('cy', ty);
    wireGroup.setAttribute('opacity', op.toFixed(3));
  }

  function setActive(idx) {
    if (idx === activeIdx) return;
    activeIdx = idx;
    railItems.forEach((el, i) => el.classList.toggle('is-active', i === idx));
    updateWire();
    try { if (chapters[idx]) history.replaceState(null, '', '#' + chapters[idx].id); } catch (e) {}
  }

  /* ─────────────────────────────────── 5 · 跳转 */
  function jump(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  }
  $$('[data-jump]').forEach(el => {
    el.addEventListener('click', ev => {
      ev.preventDefault();
      jump(el.dataset.jump);
    });
  });

  /* ─────────────────────────────────── 6 · 大图查看器 */
  const lb = $('[data-lb]');
  const lbImg = $('[data-lb-img]');
  const lbTitle = $('[data-lb-title]');
  const lbCount = $('[data-lb-count]');
  const lbFile = $('[data-lb-file]');
  const lbTrack = $('[data-lb-track]');
  const lbPrev = $('[data-lb-prev]');
  const lbNext = $('[data-lb-next]');

  let lbState = { slug: null, i: 0 };
  let lastFocus = null;

  function openLightbox(slug, i) {
    const set = DATA.find(t => t.slug === slug);
    if (!set) return;
    lbState = { slug, i };
    lbTitle.textContent = set.title + (set.years ? ' — ' + set.years : '');
    lbImg.src = set.plates[i].file;
    lbImg.alt = `${set.title} — plate ${set.plates[i].n}`;
    lbCount.innerHTML = `<b>${String(i + 1).padStart(2, '0')}</b> / ${set.count}`;
    lbFile.textContent = set.plates[i].file.replace('media/', '');

    if (lbTrack.children.length !== set.count) {
      lbTrack.innerHTML = set.plates.map(() => '<i></i>').join('');
    }
    Array.from(lbTrack.children).forEach((c, k) => c.classList.toggle('is-on', k === i));

    lbPrev.disabled = false;
    lbNext.disabled = false;

    lastFocus = document.activeElement;
    lb.classList.add('is-open');
    document.body.classList.add('is-locked');

    // 预载相邻
    [-1, 1].forEach(d => {
      const n = (i + d + set.count) % set.count;
      const im = new Image();
      im.src = set.plates[n].file;
    });
    lb.querySelector('[data-lb-close]').focus({ preventScroll: true });
  }

  function closeLightbox() {
    lb.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function step(d) {
    const set = DATA.find(t => t.slug === lbState.slug);
    if (!set) return;
    openLightbox(lbState.slug, (lbState.i + d + set.count) % set.count);
  }

  document.addEventListener('click', ev => {
    const plate = ev.target.closest('.plate');
    if (plate) { openLightbox(plate.dataset.slug, +plate.dataset.i); return; }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      const plate = ev.target.closest && ev.target.closest('.plate');
      if (plate) { ev.preventDefault(); openLightbox(plate.dataset.slug, +plate.dataset.i); }
    }
  });

  $('[data-lb-close]').addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click', () => step(-1));
  lbNext.addEventListener('click', () => step(1));
  lb.addEventListener('click', ev => { if (ev.target === lb || ev.target.classList.contains('lb__stage')) closeLightbox(); });

  document.addEventListener('keydown', ev => {
    if (!lb.classList.contains('is-open')) return;
    if (ev.key === 'Escape') closeLightbox();
    else if (ev.key === 'ArrowLeft')  { ev.preventDefault(); step(-1); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); step(1); }
  });

  // 触屏滑动
  let touchX = 0;
  lb.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 56) step(dx > 0 ? -1 : 1);
  }, { passive: true });

  /* ─────────────────────────────────── 7 · 时间戳 */
  const epochEl = $('[data-epoch-digits]');
  if (epochEl) {
    const tick = () => { epochEl.textContent = String(Math.floor(Date.now() / 1000)); };
    tick();
    setInterval(tick, 1000);
  }

  /* ─────────────────────────────────── 8 · 照片星座图 */
  (function constellation() {
    const wrap = $('.hero__graph');
    const cv = $('#constellation');
    if (!cv || !wrap) return;
    const ctx = cv.getContext('2d', { alpha: true });

    let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
    let nodes = [], hubs = [], spokes = [], ready = false;
    let t0 = performance.now();
    let pulseClock = 0, pulse = null;
    let mx = 0, my = 0, mxS = 0, myS = 0;
    let visible = true;

    // 小型确定性随机
    let seed = 20260418;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const HUB_CFG = [
      { k: 0, cx: 0.28, cy: 0.27 },
      { k: 1, cx: 0.60, cy: 0.16 },
      { k: 2, cx: 0.79, cy: 0.45 }
    ];
    const HUB_CFG_M = [
      { k: 0, cx: 0.34, cy: 0.15 },
      { k: 1, cx: 0.62, cy: 0.37 },
      { k: 2, cx: 0.40, cy: 0.60 }
    ];

    function build() {
      nodes = []; hubs = []; spokes = [];
      seed = 20260418;
      const narrow = W < 720;
      const cfgs = narrow ? HUB_CFG_M : HUB_CFG;

      cfgs.forEach((cfg, hi) => {
        const set = DATA[hi];
        if (!set) return;
        const hx = cfg.cx * W, hy = cfg.cy * H;
        hubs.push({ x: hx, y: hy, title: set.title, count: set.count, k: hi, phase: rnd() * 6.28 });

        const n = set.plates.length;
        const rx = narrow ? W * 0.46 : Math.min(W * 0.22, 260) * (0.85 + hi * 0.09);
        const ry = narrow ? W * 0.30 : rx * 0.62;

        set.plates.forEach((p, i) => {
          const base = (i / n) * Math.PI * 2 + hi * 1.9 + rnd() * 0.5;
          const ang = base;
          const rr = 0.42 + rnd() * 0.58;
          const x = hx + Math.cos(ang) * rx * rr;
          const y = hy + Math.sin(ang) * ry * rr;
          const node = {
            x, y, hx, hy, ang, rr,
            img: null, delay: 0.30 + (i / n) * 0.55 + rnd() * 0.08,
            drift: rnd() * 6.28, plate: p, hub: hi,
            w: 22, h: 22 * (p.h / p.w)
          };
          nodes.push(node);
          spokes.push({ hub: hi, ang, rr, delay: 0.16 + (i / n) * 0.5 });
          const img = new Image();
          img.src = 'data:image/webp;base64,' + p.lqip;
          img.onload = () => { node.img = img; };
        });
      });
      ready = true;
    }

    function resize() {
      const r = wrap.getBoundingClientRect();
      W = Math.max(320, r.width);
      H = Math.max(320, r.height);
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      build();
    }

    function draw(now) {
      if (!visible) return;
      const t = REDUCED ? 2 : clamp((now - t0) / 2600, 0, 1.6);

      ctx.clearRect(0, 0, W, H);

      ctx.save();
      ctx.translate(mxS, myS);

      // 连线
      nodes.forEach((nd, i) => {
        const local = clamp((t - 0.12 - nd.delay * 0.35) / 0.55, 0, 1);
        if (local <= 0) return;
        const e = smooth(local);
        const x1 = nd.hx, y1 = nd.hy;
        const x2 = lerp(x1, nd.x, e), y2 = lerp(y1, nd.y, e);
        const g = ctx.createLinearGradient(x1, y1, x2, y2);
        g.addColorStop(0, 'rgba(255,255,255,0.30)');
        g.addColorStop(1, 'rgba(255,255,255,0.06)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });

      // 节点
      nodes.forEach((nd, i) => {
        const local = clamp((t - nd.delay) / 0.5, 0, 1);
        if (local <= 0) return;
        const e = smooth(local);
        const bob = REDUCED ? 0 : Math.sin(now / 2600 + nd.drift) * 1.15;
        const x = nd.x + bob * 0.6, y = nd.y + bob * 0.5;
        const w = nd.w * (0.55 + 0.45 * e);
        const h = nd.h * (0.55 + 0.45 * e);

        ctx.globalAlpha = 0.14 + 0.72 * e;
        if (nd.img) {
          ctx.drawImage(nd.img, x - w / 2, y - h / 2, w, h + 0.5);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,.22)';
          ctx.fillRect(x - w / 2, y - h / 2, w, h);
        }
        ctx.globalAlpha = 0.10 + 0.16 * e;
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = 0.6;
        ctx.strokeRect(x - w / 2, y - h / 2, w, h);
      });
      ctx.globalAlpha = 1;

      // 枢纽
      hubs.forEach((hb, hi) => {
        const local = clamp((t - hi * 0.06) / 0.45, 0, 1);
        if (local <= 0) return;
        const e = smooth(local);
        const pulseR = REDUCED ? 0 : (Math.sin(now / 900 + hb.phase) * 2.2);

        ctx.strokeStyle = `rgba(255,255,255,${0.5 * e})`;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(hb.x, hb.y, 4.5 + pulseR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = `rgba(255,255,255,${0.95 * e})`;
        ctx.beginPath();
        ctx.arc(hb.x, hb.y, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // 标签
        ctx.font = '500 10px "Geist Mono", monospace';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(255,255,255,${0.92 * e})`;
        const label = hb.title;
        const tw = ctx.measureText(label).width;
        ctx.fillText(label, hb.x - tw / 2, hb.y - 20);
        ctx.fillStyle = `rgba(255,255,255,${0.42 * e})`;
        ctx.font = '400 9px "Geist Mono", monospace';
        const sub = String(hb.count).padStart(2, '0') + ' PLATES';
        const sw = ctx.measureText(sub).width;
        ctx.fillText(sub, hb.x - sw / 2, hb.y + 20);
      });

      // 沿连线奔跑的小脉冲
      if (!REDUCED) {
        pulseClock = now;
        if (!pulse || now - pulse.start > 1250) {
          const nd = nodes[Math.floor(rnd() * nodes.length)];
          pulse = { start: now, node: nd, len: 1250 };
        }
        const pt = (now - pulse.start) / pulse.len;
        if (pt < 1 && pulse.node) {
          const nd = pulse.node;
          const x = lerp(nd.hx, nd.x, smooth(pt));
          const y = lerp(nd.hy, nd.y, smooth(pt));
          ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - pt)})`;
          ctx.beginPath();
          ctx.arc(x, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    let raf = null;
    function loop(now) {
      mxS = lerp(mxS, mx, 0.06);
      myS = lerp(myS, my, 0.06);
      draw(now);
      raf = requestAnimationFrame(loop);
    }

    new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(loop);
      if (!visible && raf) { cancelAnimationFrame(raf); raf = null; }
    }, { threshold: 0.02 }).observe(wrap);

    window.addEventListener('mousemove', e => {
      mx = (e.clientX / window.innerWidth - 0.5) * -16;
      my = (e.clientY / window.innerHeight - 0.5) * -12;
    }, { passive: true });

    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { resize(); }, 180);
    });

    resize();
    t0 = performance.now();
    raf = requestAnimationFrame(loop);
  })();

  /* ─────────────────────────────────── 9 · 主循环 */
  const scrollBar = $('[data-scrollbar]');
  let lastScrollY = -1;

  let lastFrameT = performance.now();

  function frame(now) {
    const t = typeof now === 'number' ? now : performance.now();
    const dt = Math.min(150, Math.max(8, t - lastFrameT));
    lastFrameT = t;

    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - VH();

    pTarget = computeBlend();
    // 时间修正的指数趋近：帧率再低也不会留下色差
    const kk = REDUCED ? 1 : 1 - Math.exp(-dt / 115);
    pSmooth = lerp(pSmooth, pTarget, kk);
    if (Math.abs(pTarget - pSmooth) < 0.0015) pSmooth = pTarget;
    paintLayers(pSmooth);

    if (scrollBar) scrollBar.style.width = (max > 0 ? clamp(y / max, 0, 1) * 100 : 0).toFixed(2) + '%';

    setActive(activeIndex());
    setInk(indexAt(0.35));

    if (y !== lastScrollY) { lastScrollY = y; updateWire(); }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ─────────────────────────────────── 10 · 杂项 */
  window.addEventListener('resize', () => { measure(); updateWire(); });
  window.addEventListener('load', () => { measure(); updateWire(); revealInView(); });

  // 首屏若带 hash，直接定位
  if (location.hash) {
    const el = document.getElementById(location.hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'auto', block: 'start' }), 40);
  }

  // 让导航轨首项立刻进入 active 态
  setActive(0);
  setInk(0);
  measure();
  revealInView();
})();








