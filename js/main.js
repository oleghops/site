(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const menuButton = document.querySelector('.toc-toggle');
  const nav = document.getElementById('chapter-nav');
  function closeMenu() { nav.classList.remove('is-open'); menuButton.setAttribute('aria-expanded', 'false'); }
  menuButton.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { closeMenu(); menuButton.focus(); } });
  const progress = document.querySelector('.reading-track span');
  const article = document.getElementById('article');
  const navLinks = [...nav.querySelectorAll('a')];
  const targets = navLinks.map(a => document.querySelector(a.getAttribute('href')));
  let scheduled = false;
  function updateReading() {
    scheduled = false;
    const start = article.offsetTop;
    const distance = article.offsetHeight - innerHeight;
    const ratio = distance > 0 ? Math.min(1, Math.max(0, (scrollY - start) / distance)) : 1;
    progress.style.transform = `scaleX(${ratio})`;
    let current = -1;
    targets.forEach((target, i) => { if (target.getBoundingClientRect().top <= 160) current = i; });
    navLinks.forEach((link, i) => { if (i === current) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
  }
  function scheduleReading() { if (!scheduled) { scheduled = true; requestAnimationFrame(updateReading); } }
  addEventListener('scroll', scheduleReading, {passive:true});
  addEventListener('resize', scheduleReading, {passive:true});
  addEventListener('load', scheduleReading);
  if ('ResizeObserver' in window) new ResizeObserver(scheduleReading).observe(article);
  scheduleReading();

  document.querySelectorAll('.photo-link img').forEach(img => {
    const showFailure = () => { img.closest('.photo-link').classList.add('is-broken'); };
    img.addEventListener('error', showFailure);
    if (img.complete && !img.naturalWidth) showFailure();
  });
  const dialog = document.getElementById('lightbox');
  const links = [...document.querySelectorAll('a[data-photo]')];
  const image = dialog.querySelector('.lightbox-image');
  const caption = dialog.querySelector('.lightbox-caption');
  const counter = dialog.querySelector('.lightbox-count');
  const previous = dialog.querySelector('[data-previous]');
  const next = dialog.querySelector('[data-next]');
  const close = dialog.querySelector('[data-close]');
  const failure = dialog.querySelector('.lightbox-error');
  let gallery = [], active = 0, opener = null;
  function render() {
    const link = gallery[active];
    const fig = link.closest('figure');
    failure.hidden = true;
    image.alt = link.querySelector('img').alt;
    image.src = link.href;
    caption.replaceChildren(...[...fig.querySelector('figcaption').childNodes].map(node => node.cloneNode(true)));
    counter.textContent = `${active + 1} / ${gallery.length}`;
    previous.disabled = active === 0;
    next.disabled = active === gallery.length - 1;
    // Keep focus operable when the arrow just used becomes disabled.
    if (document.activeElement === previous && previous.disabled) next.focus();
    if (document.activeElement === next && next.disabled) previous.focus();
  }
  function move(delta) {
    const index = active + delta;
    if (index >= 0 && index < gallery.length) { active = index; render(); }
  }
  links.forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0 || typeof dialog.showModal !== 'function') return;
    event.preventDefault();
    opener = link;
    gallery = links.filter(other => other.dataset.gallery === link.dataset.gallery);
    active = gallery.indexOf(link);
    render();
    dialog.showModal();
    document.body.classList.add('modal-open');
    close.focus();
  }));
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  close.addEventListener('click', () => dialog.close());
  image.addEventListener('error', () => { failure.hidden = false; });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    image.removeAttribute('src');
    if (opener) opener.focus({preventScroll:true});
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll('button:not(:disabled), a[href]')].filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  // Swipe augments, rather than replaces, visible previous/next controls.
  let touchStart = null;
  image.addEventListener('touchstart', event => { touchStart = event.touches.length === 1 ? event.touches[0].clientX : null; }, {passive:true});
  image.addEventListener('touchend', event => {
    if (touchStart !== null && event.changedTouches.length) {
      const dx = event.changedTouches[0].clientX - touchStart;
      if (Math.abs(dx) > 60) move(dx < 0 ? 1 : -1);
    }
    touchStart = null;
  }, {passive:true});
})();

(() => {
  'use strict';
  const root = document.documentElement;
  const cursor = document.getElementById('kbr-cursor');
  const canvas = document.getElementById('kbr-trail-canvas');
  if (!cursor || !canvas) return;
  let ctx;
  try { ctx = canvas.getContext('2d', {alpha:true}); } catch (_) { return; }
  if (!ctx) return;

  const finePointer = matchMedia('(pointer: fine) and (hover: hover)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const lightbox = document.getElementById('lightbox');
  const interactive = 'a,button,summary,[role="button"],input,textarea,select,label[for]';
  const darkSurface = '.chapter.dark,.landscape-poster,.lightbox,.plate-textile,.woven-rule,.photo-link';
  const palette = getComputedStyle(root);
  const charcoal = palette.getPropertyValue('--ink').trim() || '#191918';
  const graphite = palette.getPropertyValue('--muted').trim() || '#62615B';
  const particles = [];
  const MAX_PARTICLES = 240;
  let enabled = false, visible = false, pendingMove = false, frame = 0;
  let x = 0, y = 0, previousX = 0, previousY = 0, hasPrevious = false;
  let lastMoveAt = 0, carry = 0, marks = 0, width = 0, height = 0;
  let latestTarget = null;

  function setInteractive(target) {
    const control = target instanceof Element ? target.closest(interactive) : null;
    const active = !!control && !control.matches(':disabled,[aria-disabled="true"]');
    cursor.classList.toggle('is-interactive', enabled && active);
  }
  function clearTrail() {
    particles.length = 0;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    ctx.clearRect(0, 0, width, height);
  }
  function hide(clear = false) {
    visible = false;
    pendingMove = false;
    hasPrevious = false;
    carry = 0;
    cursor.classList.remove('is-visible', 'is-interactive', 'is-pressed');
    root.classList.remove('kbr-cursor-ready');
    if (clear) clearTrail();
  }
  function resize() {
    hide(true);
    width = innerWidth;
    height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function configure() {
    enabled = finePointer.matches && !reducedMotion.matches;
    hide(true);
    if (enabled) resize();
    else { canvas.width = 1; canvas.height = 1; }
  }
  function wake() {
    if (!frame && enabled && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function seed(now, distance, angle, speed) {
    const spacing = Math.max(7, 13 - speed * 2);
    const travel = carry + distance;
    const count = Math.min(6, Math.floor(travel / spacing));
    carry = travel % spacing;
    if (!count) return;
    const dark = latestTarget instanceof Element && latestTarget.closest(darkSurface);
    const color = dark ? '#A6A6A2' : charcoal;
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const px = previousX + (x - previousX) * t;
      const py = previousY + (y - previousY) * t;
      const dustCount = speed > .65 ? 2 : 1;
      for (let j = 0; j < dustCount; j++) {
        const scatter = 3 + Math.min(speed, 3) * 1.5;
        particles.push({kind:0, x:px + (Math.random() - .5) * scatter,
          y:py + (Math.random() - .5) * scatter, born:now, life:500 + Math.random() * 200,
          size:.5 + Math.random() * .5, angle:0, spin:0,
          vx:-Math.cos(angle) * (3 + Math.random() * 8) + (Math.random() - .5) * 7,
          vy:3 - Math.sin(angle) * 5 + Math.random() * 5,
          color:dark ? color : (Math.random() > .65 ? graphite : charcoal), alpha:dark ? .38 : .4});
      }
      if (++marks % 3 === 0) {
        particles.push({kind:1, x:px, y:py, born:now, life:400 + Math.random() * 200,
          size:.6 + Math.random() * .4, angle:angle + (Math.random() - .5) * .5,
          spin:(Math.random() - .5) * .55, vx:-Math.cos(angle) * 6, vy:3 - Math.sin(angle) * 5,
          color, alpha:dark ? .25 : .26, lineWidth:dark ? .75 : .9});
      }
    }
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  }
  function tick(now) {
    frame = 0;
    if (!enabled || document.hidden) return;
    try {
      if (pendingMove && visible) {
        pendingMove = false;
        // No easing or positional lag: the tip uses the latest input coordinates.
        cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
        cursor.classList.add('is-visible');
        root.classList.add('kbr-cursor-ready');
        if (hasPrevious) {
          const dx = x - previousX, dy = y - previousY;
          const distance = Math.hypot(dx, dy);
          if (distance > .1) seed(now, distance, Math.atan2(dy, dx), distance / Math.max(8, now - lastMoveAt));
        }
        previousX = x; previousY = y; hasPrevious = true; lastMoveAt = now;
      }
      ctx.clearRect(0, 0, width, height);
      let alive = 0;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i], age = now - p.born;
        if (age >= p.life) continue;
        particles[alive++] = p;
        const t = age / 1000, fade = 1 - age / p.life;
        ctx.globalAlpha = p.alpha * fade * fade;
        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;
        if (!p.kind) {
          ctx.beginPath();
          ctx.arc(p.x + p.vx * t, p.y + p.vy * t + 7 * t * t, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(p.x + p.vx * t, p.y + p.vy * t);
          ctx.rotate(p.angle + p.spin * t);
          ctx.scale(p.size, p.size);
          ctx.lineWidth = p.lineWidth;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-7, -4);
          ctx.bezierCurveTo(0, -5, 10, -5, 10, 1);
          ctx.bezierCurveTo(10, 8, -1, 8, 0, 2);
          ctx.bezierCurveTo(1, -2, 6, -1, 5, 2);
          ctx.moveTo(-3, -4);
          ctx.lineTo(-7, -9);
          ctx.stroke();
          ctx.restore();
        }
      }
      particles.length = alive;
      ctx.globalAlpha = 1;
      if (particles.length || pendingMove) wake();
    } catch (_) {
      // A failed canvas must never leave the visitor without a usable pointer.
      enabled = false;
      hide(true);
    }
  }
  document.addEventListener('pointermove', event => {
    if (!enabled) return;
    if (event.pointerType === 'touch') { hide(true); return; }
    x = event.clientX; y = event.clientY; latestTarget = event.target;
    visible = true; pendingMove = true;
    setInteractive(latestTarget);
    wake();
  }, {passive:true});
  document.addEventListener('mouseover', event => { if (enabled) setInteractive(event.target); }, {passive:true});
  document.addEventListener('mouseout', event => { if (enabled) setInteractive(event.relatedTarget); }, {passive:true});
  document.addEventListener('mousedown', event => {
    if (enabled && visible && event.button === 0) cursor.classList.add('is-pressed');
  }, {passive:true});
  addEventListener('mouseup', () => cursor.classList.remove('is-pressed'), {passive:true});
  document.addEventListener('mouseleave', () => hide(true));
  document.addEventListener('keydown', event => { if (event.key === 'Tab') hide(true); });
  addEventListener('blur', () => hide(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(true); });
  addEventListener('resize', () => { if (enabled) resize(); }, {passive:true});
  finePointer.addEventListener('change', configure);
  reducedMotion.addEventListener('change', configure);

  // A modal dialog lives in the top layer, above every body z-index.
  // Move the same two noninteractive nodes into it while it is open.
  if (lightbox) {
    new MutationObserver(() => {
      const host = lightbox.open ? lightbox : document.body;
      host.append(canvas, cursor);
      hasPrevious = false;
      clearTrail();
      if (visible) {
        latestTarget = document.elementFromPoint(x, y);
        setInteractive(latestTarget);
        pendingMove = true;
        wake();
      }
    }).observe(lightbox, {attributes:true, attributeFilter:['open']});
  }
  configure();
})();
