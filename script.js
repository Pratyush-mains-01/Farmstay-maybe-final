'use strict';

/* Mar Me Yullong Farmstay: shared script for every page.
   Each page (index, gallery, reviews, locations, bookings, contact) loads this same file;
   the code below only runs the parts that exist on the page being viewed. */

/* ============================================================
   SETTINGS — edit these in one place
   ============================================================ */
const API = ''; // base URL of your backend, e.g. 'https://api.example.com'. Leave '' for same-site /api/... routes.

// Contact details used everywhere on the site (Locations, Contact, footer, WhatsApp buttons).
// Update them here and every link and number on the page changes.
const CONFIG = {
  phone:    '+91 86299 78234',
  whatsapp: '+91 97327 27759',
  email:    'temp@gmail.com',
};

/* ============================================================
   DATA
   ============================================================ */
// PLACEHOLDER PHOTOS — replace each `src` with your own farmstay photos.
// The home-page carousel uses the first 6 entries; the Gallery page uses all of them.
const galleryData = [
  { src:'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=800&q=80', cat:'interior', title:'The Library Lounge', desc:'Interior · Evening Ambience' },
  { src:'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&q=80', cat:'exterior', title:'The Grand Terrace', desc:'Exterior · Sunset' },
  { src:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80', cat:'food', title:'Tasting Menu', desc:'Food · Chef\'s Selection' },
  { src:'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&q=80', cat:'events', title:'Wedding Gala', desc:'Events · Celebrations' },
  { src:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', cat:'nature', title:'Garden Pavilion', desc:'Nature · Manicured Grounds' },
  { src:'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80', cat:'interior', title:'Royal Suite', desc:'Interior · Penthouse Collection' },
  { src:'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800&q=80', cat:'exterior', title:'Infinity Pool', desc:'Exterior · Leisure' },
  { src:'https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=800&q=80', cat:'food', title:'Morning Ritual', desc:'Food · Breakfast Service' },
  { src:'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&q=80', cat:'moments', title:'Anniversary Evening', desc:'Moments · Private Dining' },
  { src:'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80', cat:'nature', title:'Forest Retreat', desc:'Nature · Wilderness' },
  { src:'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&q=80', cat:'interior', title:'The Spa Atrium', desc:'Interior · Wellness' },
  { src:'https://images.unsplash.com/photo-1561501900-3701fa6a0864?w=800&q=80', cat:'exterior', title:'Coastal View', desc:'Exterior · Seascape' },
  { src:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80', cat:'food', title:'The Main Dining Room', desc:'Food · À la Carte' },
  { src:'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80', cat:'events', title:'New Year Gala', desc:'Events · Special Occasions' },
  { src:'https://images.unsplash.com/photo-1568454537842-d933259bb258?w=800&q=80', cat:'moments', title:'Proposal on the Terrace', desc:'Moments · Unforgettable' },
];

// REAL GUEST REVIEWS — add them here and they appear on both the home page (scrolling row)
// and the Reviews page, together with an automatic average rating.
// Leave the list empty and the home-page review section stays hidden.
// Format:
//   { name:'Guest Name', loc:'Their town', stars:5, date:'March 2026', text:'Their review…', img:'optional-photo-url' }
const reviewsData = [];

// ROOMS — each room has its OWN calendar rules. Edit names, sizes and rules to match your farmstay.
//   capacity     : most guests the room sleeps
//   minNights    : shortest stay allowed (a stay of 1–2 is 1 night)
//   maxNights    : longest stay allowed
//   advanceDays  : how far ahead guests can book (e.g. 180 = about 6 months)
//   booked       : [from, to] ranges that are taken. Every date from–to (both included) becomes unavailable.
//   closed       : [from, to] ranges you are not taking bookings (maintenance, family use, off-season)
// Dates use 'YYYY-MM-DD', e.g. ['2026-11-01', '2026-11-05'] blocks 1, 2, 3, 4 and 5 November.
// The sample ranges below use inDays(n) = "n days from today" only so you can see the calendar working.
// Replace them with real dates, or let your admin panel/server supply them through /api/availability?room=ID.
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return toISODate(d); };
const ROOMS = [
  { id:'garden',   name:'Garden View Room',   capacity:2, minNights:1, maxNights:14, advanceDays:365,
    note:'Quiet room facing the garden',
    booked:[[inDays(5), inDays(8)], [inDays(20), inDays(24)]],
    closed:[] },
  { id:'mountain', name:'Mountain View Room', capacity:3, minNights:2, maxNights:7,  advanceDays:270,
    note:'Wide windows with hill views',
    booked:[[inDays(2), inDays(4)], [inDays(12), inDays(15)]],
    closed:[[inDays(40), inDays(50)]] },
  { id:'family',   name:'Family Suite',       capacity:5, minNights:2, maxNights:10, advanceDays:180,
    note:'Spacious suite for families and groups',
    booked:[[inDays(9), inDays(13)]],
    closed:[] },
];

/* ============================================================
   HELPERS
   ============================================================ */
const $ = id => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer  = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const smooth = () => (reduceMotion ? 'auto' : 'smooth');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Several things can lock page scroll at once (menu, modal, lightbox, chat).
const scrollLocks = new Set();
function setScrollLock(key, on) {
  on ? scrollLocks.add(key) : scrollLocks.delete(key);
  document.body.style.overflow = scrollLocks.size ? 'hidden' : '';
}

function rafThrottle(fn) {
  let queued = false;
  return (...args) => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...args); });
  };
}

function pad2(n) { return String(n).padStart(2, '0'); }
function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayISO() { return toISODate(new Date()); }
function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

/* ─── TOAST (small messages that work well on phones) ───── */
let toastTimer;
function showToast(message) {
  let t = $('toast');
  if (!t) {
    t = el('div'); t.id = 'toast';
    t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4500);
}

/* ─── SERVER REQUESTS ───────────────────────────────────── */
async function postJSON(path, data) {
  try {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    let body = null;
    try { body = await res.json(); } catch (_) { /* server returned no JSON */ }
    if (!res.ok) return { ok: false, error: (body && body.error) || 'Something went wrong. Please try again.' };
    return { ok: true, data: body };
  } catch (_) {
    return { ok: false, network: true, error: "We couldn't reach our server. Please call or WhatsApp us instead." };
  }
}

/* ─── FORM VALIDATION ───────────────────────────────────── */
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function invalid(field, message) {
  field.classList.add('invalid');
  field.setAttribute('aria-invalid', 'true');
  showToast(message);
  try { field.focus({ preventScroll: false }); } catch (_) { field.focus(); }
  return false;
}
document.addEventListener('input', e => {
  if (e.target.classList && e.target.classList.contains('invalid')) {
    e.target.classList.remove('invalid'); e.target.removeAttribute('aria-invalid');
  }
});
document.addEventListener('change', e => {
  if (e.target.classList && e.target.classList.contains('invalid')) {
    e.target.classList.remove('invalid'); e.target.removeAttribute('aria-invalid');
  }
});
function validateName(f)  { return f.value.trim().length >= 2 || invalid(f, 'Please enter your name.'); }
function validateEmail(f) { return emailRe.test(f.value.trim()) || invalid(f, 'Please enter a valid email address.'); }
function validatePhone(f) { return f.value.replace(/\D/g, '').length >= 7 || invalid(f, 'Please enter a valid phone number.'); }
function validateFilled(f, msg) { return f.value.trim().length > 0 || invalid(f, msg); }

/* ============================================================
   LOADER
   ============================================================ */
const loader = $('loader');
let loaderGone = false;
// The loading screen shows once per visit (first page opened). Later pages skip it so browsing stays quick.
if (loader && document.documentElement.classList.contains('no-loader')) { loader.remove(); loaderGone = true; }
function hideLoader() {
  if (loaderGone || !loader) return;
  loaderGone = true;
  try { sessionStorage.setItem('mmy-loader', '1'); } catch (_) { /* private mode */ }
  loader.classList.add('hidden');
  setTimeout(() => loader.remove(), 900);
}
window.addEventListener('load', () => setTimeout(hideLoader, 900));
setTimeout(hideLoader, 3500); // never keep visitors waiting on a slow image or connection

/* ============================================================
   CURSOR (mouse devices only)
   ============================================================ */
if (finePointer) {
  const dot = $('cursor-dot'), ring = $('cursor-ring');
  let mouseX = -100, mouseY = -100, ringX = -100, ringY = -100, known = false;

  // The mouse position is remembered between pages, so the cursor never jumps to a corner when a new page opens.
  const place = () => {
    dot.style.left = mouseX + 'px'; dot.style.top = mouseY + 'px';
    ring.style.left = ringX + 'px'; ring.style.top = ringY + 'px';
  };
  const restore = () => {
    try {
      const s = JSON.parse(sessionStorage.getItem('mmy-cursor'));
      if (s && typeof s.x === 'number') { mouseX = ringX = s.x; mouseY = ringY = s.y; known = true; place(); }
    } catch (_) { /* nothing saved yet */ }
  };
  const save = () => { if (known) { try { sessionStorage.setItem('mmy-cursor', JSON.stringify({ x: mouseX, y: mouseY })); } catch (_) {} } };
  restore();
  if (!known) { dot.style.opacity = ring.style.opacity = '0'; } // hidden until the mouse first moves

  document.addEventListener('mousemove', e => {
    mouseX = e.clientX; mouseY = e.clientY;
    if (!known) { known = true; ringX = mouseX; ringY = mouseY; dot.style.opacity = ring.style.opacity = ''; }
    dot.style.left = mouseX + 'px'; dot.style.top = mouseY + 'px';
  });
  window.addEventListener('pagehide', save);
  window.addEventListener('beforeunload', save);
  window.addEventListener('pageshow', restore);                 // back/forward cache
  document.addEventListener('prerenderingchange', restore);     // page opened instantly from a pre-load

  (function lerpCursor() {
    ringX += (mouseX - ringX) * 0.12;
    ringY += (mouseY - ringY) * 0.12;
    ring.style.left = ringX + 'px'; ring.style.top = ringY + 'px';
    requestAnimationFrame(lerpCursor);
  })();
  const hoverSel = 'a, button, .carousel-slide, .masonry-item';
  document.addEventListener('mouseover', e => { if (e.target.closest(hoverSel)) ring.classList.add('hovered'); });
  document.addEventListener('mouseout',  e => { if (e.target.closest(hoverSel)) ring.classList.remove('hovered'); });
}

/* ============================================================
   RIPPLE
   ============================================================ */
document.addEventListener('click', e => {
  const btn = e.target.closest('.btn-primary, .submit-btn');
  if (!btn || reduceMotion) return;
  const r = el('span', 'ripple-effect');
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
  btn.appendChild(r);
  r.addEventListener('animationend', () => r.remove());
});

/* ============================================================
   NAVBAR, SCROLL PROGRESS, BACK TO TOP, PARALLAX
   ============================================================ */
const navbar      = $('navbar');
const progressBar = $('scroll-progress');
const backTop     = $('back-top');
const homePage    = $('page-home');
const heroContent = document.querySelector('.hero-content');
const allowParallax = finePointer && !reduceMotion;

function onScroll() {
  const y = window.scrollY;
  navbar.classList.toggle('scrolled', y > 60);
  const total = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.width = (total > 0 ? Math.min(100, (y / total) * 100) : 0) + '%';
  backTop.classList.toggle('visible', y > 400);
  if (allowParallax && heroContent && homePage.classList.contains('active') && y < window.innerHeight) {
    heroContent.style.transform = `translateY(${y * 0.3}px)`;
  }
}
window.addEventListener('scroll', rafThrottle(onScroll), { passive: true });
function scrollToTop() { window.scrollTo({ top: 0, behavior: smooth() }); }
onScroll();

/* ============================================================
   MOBILE NAV
   ============================================================ */
const hamburger = $('hamburger');
const mobileNav = $('mobile-nav');
function setMobileNav(open) {
  hamburger.classList.toggle('open', open);
  mobileNav.classList.toggle('open', open);
  hamburger.setAttribute('aria-expanded', String(open));
  mobileNav.setAttribute('aria-hidden', String(!open));
  setScrollLock('menu', open);
}
function closeMobileNav() { setMobileNav(false); }
hamburger.addEventListener('click', () => setMobileNav(!mobileNav.classList.contains('open')));
window.addEventListener('resize', rafThrottle(() => { if (window.innerWidth > 1100) closeMobileNav(); }));

/* ============================================================
   PAGE LINKS
   ============================================================ */
const PAGE_URLS = {
  home: 'index.html', gallery: 'gallery.html', reviews: 'reviews.html',
  locations: 'locations.html', bookings: 'bookings.html', contact: 'contact.html',
};
const currentPage = document.body.dataset.page || 'home';
function navigateTo(page) { location.href = PAGE_URLS[page] || PAGE_URLS.home; }
// the menu pages are separate files, so the current one is highlighted
document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(a => {
  const active = a.dataset.page === currentPage;
  a.classList.toggle('active', active);
  if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
});

/* ============================================================
   CONTACT DETAILS (from CONFIG)
   ============================================================ */
function applyContactConfig() {
  const tel = CONFIG.phone.replace(/[^\d+]/g, '');
  const wa  = CONFIG.whatsapp.replace(/\D/g, '');
  document.querySelectorAll('[data-contact]').forEach(a => {
    const kind = a.dataset.contact;
    if (kind === 'phone')    { a.textContent = CONFIG.phone;    a.href = 'tel:' + tel; }
    if (kind === 'whatsapp') { a.textContent = CONFIG.whatsapp; a.href = 'https://wa.me/' + wa; }
    if (kind === 'email')    { a.textContent = CONFIG.email;    a.href = 'mailto:' + CONFIG.email; }
  });
  document.querySelectorAll('[data-contact-href="whatsapp"]').forEach(a => { a.href = 'https://wa.me/' + wa; });
}
applyContactConfig();

/* ============================================================
   PARTICLES (paused when hero is not on screen)
   ============================================================ */
(function initParticles() {
const canvas = $('particles-canvas');
if (!canvas) return; // only the home page has the hero canvas
const ctx = canvas.getContext('2d');
let particles = [];
function resizeCanvas() {
  const host = canvas.parentElement;
  const w = host.offsetWidth, h = host.offsetHeight;
  if (!w || !h) return;
  canvas.width = w; canvas.height = h;
}
resizeCanvas();
window.addEventListener('resize', rafThrottle(resizeCanvas));
if ('ResizeObserver' in window) new ResizeObserver(rafThrottle(resizeCanvas)).observe(canvas.parentElement);

class Particle {
  constructor() { this.reset(); }
  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.size = Math.random() * 1.5 + 0.3;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = -Math.random() * 0.5 - 0.1;
    this.alpha = Math.random() * 0.5 + 0.1;
    this.life = 0; this.maxLife = Math.random() * 300 + 100;
  }
  update() {
    this.x += this.vx; this.y += this.vy; this.life++;
    if (this.life > this.maxLife) this.reset();
  }
  draw() {
    const t = this.life / this.maxLife;
    const a = this.alpha * (t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(201,169,110,${a})`;
    ctx.fill();
  }
}
const particleCount = window.innerWidth < 768 ? 35 : 80;
for (let i = 0; i < particleCount; i++) particles.push(new Particle());
function animateParticles() {
  if (!document.hidden && homePage.classList.contains('active') && !reduceMotion) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
  }
  requestAnimationFrame(animateParticles);
}
animateParticles();
})();

/* ============================================================
   HERO VIDEO (skipped on phones, slow connections and Data Saver)
   ============================================================ */
(function heroVideo() {
  const video = $('hero-video');
  if (!video) return;
  const conn = navigator.connection || {};
  const slow = conn.saveData || ['slow-2g', '2g', '3g'].includes(conn.effectiveType);
  if (window.innerWidth <= 768 || slow || reduceMotion) return;
  video.src = video.dataset.src;
  video.style.display = 'block';
  const p = video.play();
  if (p && p.catch) p.catch(() => { video.style.display = 'none'; });
})();

/* ============================================================
   REVEAL ON SCROLL
   ============================================================ */
const revealObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' })
  : null;
function observeReveal(node) {
  if (revealObserver) revealObserver.observe(node); else node.classList.add('visible');
}
document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(observeReveal);

/* ============================================================
   HORIZONTAL SCROLLERS (touch swipe, trackpad, mouse drag, arrows)
   ============================================================ */
function enableDragScroll(track) {
  let down = false, moved = false, startX = 0, startLeft = 0;
  track.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft;
  });
  track.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) > 6) { moved = true; track.classList.add('dragging'); }
    if (moved) track.scrollLeft = startLeft - dx;
  });
  const end = () => { if (!down) return; down = false; track.classList.remove('dragging'); };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointerleave', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
}

function stepSize(track) {
  const first = track.firstElementChild;
  if (!first) return track.clientWidth;
  const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
  return first.getBoundingClientRect().width + gap;
}

function setupScroller({ track, prev, next, nav, dots }) {
  enableDragScroll(track);
  const maxScroll = () => track.scrollWidth - track.clientWidth;
  const currentIndex = () => {
    const count = track.children.length;
    if (!count) return 0;
    if (track.scrollLeft >= maxScroll() - 2) return count - 1;
    return Math.round(track.scrollLeft / stepSize(track));
  };
  const update = () => {
    const overflow = maxScroll() > 2;
    if (nav) nav.hidden = !overflow;
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= maxScroll() - 2;
    if (dots) {
      const idx = currentIndex();
      [...dots.children].forEach((d, i) => {
        d.classList.toggle('active', i === idx);
        d.setAttribute('aria-current', i === idx ? 'true' : 'false');
      });
    }
  };
  prev.addEventListener('click', () => track.scrollBy({ left: -stepSize(track), behavior: smooth() }));
  next.addEventListener('click', () => track.scrollBy({ left:  stepSize(track), behavior: smooth() }));
  track.addEventListener('scroll', rafThrottle(update), { passive: true });
  track.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); prev.click(); }
  });
  window.addEventListener('resize', rafThrottle(update));
  if ('ResizeObserver' in window) new ResizeObserver(rafThrottle(update)).observe(track);
  update();
  return { update, goTo: i => track.scrollTo({ left: i * stepSize(track), behavior: smooth() }) };
}

/* ============================================================
   HOME CAROUSEL (built from galleryData)
   ============================================================ */
(function initCarousel() {
  const track = $('carousel-track');
  if (!track) return; // home page only
  galleryData.slice(0, 6).forEach(item => {
    const slide = el('div', 'carousel-slide');
    slide.setAttribute('role', 'button');
    slide.setAttribute('tabindex', '0');
    slide.setAttribute('aria-label', 'View gallery - ' + item.title);
    const img = el('img'); img.src = item.src; img.alt = item.title; img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false;
    const overlay = el('div', 'carousel-slide-overlay');
    overlay.append(el('h4', null, item.title), el('p', null, item.desc));
    slide.append(img, overlay);
    slide.addEventListener('click', () => navigateTo('gallery'));
    slide.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateTo('gallery'); } });
    track.appendChild(slide);
  });
  setupScroller({ track, prev: $('carousel-prev'), next: $('carousel-next'), nav: $('carousel-nav') });
})();

/* ============================================================
   REVIEWS (home scroller + Reviews page, from reviewsData)
   ============================================================ */
function starString(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

(function initHomeReviews() {
  const section = $('testimonials-preview');
  if (!section) return; // home page only
  if (!reviewsData.length) { section.hidden = true; return; }
  section.hidden = false;
  const track = $('testimonials-track');
  const dots  = $('testimonial-dots');
  reviewsData.forEach(r => {
    const card = el('div', 'testimonial-card');
    const stars = el('div', 'testimonial-stars', starString(r.stars));
    stars.setAttribute('aria-label', r.stars + ' out of 5 stars');
    const quote = el('p', 'testimonial-quote', '\u201C' + r.text + '\u201D');
    const author = el('div', 'testimonial-author');
    const who = el('div');
    who.append(el('div', 'testimonial-name', r.name), el('div', 'testimonial-location', [r.loc, r.date].filter(Boolean).join(' · ')));
    author.appendChild(who);
    card.append(stars, quote, author);
    track.appendChild(card);
    dots.appendChild(el('button', 't-dot'));
  });
  const ctl = setupScroller({ track, prev: $('testimonials-prev'), next: $('testimonials-next'), nav: $('testimonials-nav'), dots });
  [...dots.children].forEach((d, i) => { d.type = 'button'; d.setAttribute('aria-label', 'Go to review ' + (i + 1)); d.addEventListener('click', () => ctl.goTo(i)); });
  dots.removeAttribute('aria-hidden');
  dots.hidden = reviewsData.length < 2;
})();

(function initReviewsPage() {
  const grid = $('reviews-grid'), empty = $('reviews-empty'), summary = $('rating-summary');
  if (!grid) return; // Reviews page only
  if (!reviewsData.length) { empty.hidden = false; summary.hidden = true; return; }
  empty.hidden = true;

  reviewsData.forEach(r => {
    const card = el('div', 'review-card reveal');
    const header = el('div', 'review-header');
    if (r.img) {
      const img = el('img', 'review-avatar'); img.src = r.img; img.alt = r.name; img.loading = 'lazy';
      header.appendChild(img);
    } else {
      header.appendChild(el('div', 'review-avatar review-avatar-initial', r.name.trim().charAt(0).toUpperCase()));
    }
    const meta = el('div');
    meta.append(el('div', 'review-name', r.name), el('div', 'review-date', [r.loc, r.date].filter(Boolean).join(' · ')));
    header.appendChild(meta);
    const stars = el('div', 'review-stars', starString(r.stars));
    stars.setAttribute('aria-label', r.stars + ' stars');
    card.append(header, stars, el('p', 'review-text', '\u201C' + r.text + '\u201D'));
    grid.appendChild(card);
    observeReveal(card);
  });

  // average + distribution, calculated from the real reviews
  const total = reviewsData.length;
  const avg = reviewsData.reduce((s, r) => s + r.stars, 0) / total;
  const left = el('div');
  left.append(
    el('div', 'rating-big', avg.toFixed(1)),
    el('div', 'rating-stars-big', starString(Math.round(avg))),
    el('div', 'rating-total', 'Based on ' + total + (total === 1 ? ' review' : ' reviews'))
  );
  const bars = el('div', 'rating-bars');
  for (let s = 5; s >= 1; s--) {
    const pct = Math.round((reviewsData.filter(r => r.stars === s).length / total) * 100);
    const row = el('div', 'rating-bar-row');
    const track = el('div', 'rating-bar-track');
    const fill = el('div', 'rating-bar-fill'); fill.dataset.width = pct;
    track.appendChild(fill);
    row.append(el('div', 'rating-bar-label', s + '★'), track, el('div', 'rating-bar-pct', pct + '%'));
    bars.appendChild(row);
  }
  summary.append(left, bars);
  summary.hidden = false;
  observeReveal(summary);
  initRatingBars();
})();

function initRatingBars() {
  document.querySelectorAll('.rating-bar-fill').forEach(bar => {
    setTimeout(() => { bar.style.width = bar.dataset.width + '%'; }, 400);
  });
}

/* ─── Review form ───────────────────────────────────────── */
let selectedStars = 0;
const starBtns = [...document.querySelectorAll('.star-btn')];
function paintStars(n) { starBtns.forEach((b, i) => { b.textContent = i < n ? '★' : '☆'; b.classList.toggle('filled', i < n); }); }
starBtns.forEach(btn => {
  btn.addEventListener('mouseenter', () => paintStars(+btn.dataset.star));
  btn.addEventListener('mouseleave', () => paintStars(selectedStars));
  btn.addEventListener('click', () => { selectedStars = +btn.dataset.star; paintStars(selectedStars); });
});

if ($('review-form')) $('review-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('rv-name'), email = $('rv-email'), comment = $('rv-comment');
  if (!selectedStars) { showToast('Please choose a star rating.'); return; }
  if (!validateName(name) || !validateEmail(email) || !validateFilled(comment, 'Please write a few words about your stay.')) return;
  const btn = e.target.querySelector('.submit-btn');
  btn.disabled = true;
  const res = await postJSON('/api/reviews', {
    name: name.value.trim(), email: email.value.trim(), stars: selectedStars, comment: comment.value.trim(),
  });
  btn.disabled = false;
  if (!res.ok) { showToast(res.error); return; }
  $('review-form').style.display = 'none';
  $('review-success').classList.add('show');
});

/* ============================================================
   GALLERY PAGE + LIGHTBOX
   ============================================================ */
const ASPECTS = ['4/5', '1/1', '4/3', '3/4', '1/1', '4/5'];
let galleryReady = false;
let visibleList = galleryData.map((_, i) => i); // indices currently shown (respects the filter)
let lightboxIdx = 0;
let lastFocus = null;

function initGallery() {
  if (galleryReady) return;
  galleryReady = true;
  const grid = $('masonry-grid');
  galleryData.forEach((item, i) => {
    const div = el('div', 'masonry-item');
    div.dataset.cat = item.cat;
    div.setAttribute('role', 'listitem');
    div.setAttribute('tabindex', '0');
    div.setAttribute('aria-label', item.title + ' — ' + item.desc);
    const img = el('img'); img.src = item.src; img.alt = item.title; img.loading = 'lazy'; img.decoding = 'async';
    img.style.aspectRatio = ASPECTS[i % ASPECTS.length]; img.style.objectFit = 'cover';
    const overlay = el('div', 'masonry-overlay');
    overlay.append(el('h4', null, item.title), el('p', null, item.desc));
    div.append(img, overlay);
    div.addEventListener('click', () => openLightbox(i));
    div.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(i); } });
    grid.appendChild(div);
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true');
      const f = btn.dataset.filter;
      visibleList = [];
      document.querySelectorAll('.masonry-item').forEach((item, i) => {
        const show = f === 'all' || item.dataset.cat === f;
        item.classList.toggle('hidden', !show);
        if (show) visibleList.push(i);
      });
      btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: smooth() });
    });
  });
}

const lightbox = $('lightbox');
function openLightbox(i) {
  const wasOpen = lightbox.classList.contains('open');
  if (!wasOpen) lastFocus = document.activeElement;
  lightboxIdx = i;
  const item = galleryData[i];
  const img = $('lb-img');
  img.src = item.src; img.alt = item.title;
  $('lb-title').textContent = item.title;
  $('lb-desc').textContent = item.desc;
  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  setScrollLock('lightbox', true);
  if (!wasOpen) $('lb-close').focus();
}
function closeLightbox() {
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  setScrollLock('lightbox', false);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function stepLightbox(dir) {
  if (!visibleList.length) return;
  const pos = visibleList.indexOf(lightboxIdx);
  const next = visibleList[(pos + dir + visibleList.length) % visibleList.length];
  openLightbox(next);
}
if (lightbox) {
$('lb-close').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if (e.target === e.currentTarget) closeLightbox(); });
$('lb-prev').addEventListener('click', () => stepLightbox(-1));
$('lb-next').addEventListener('click', () => stepLightbox(1));
let touchStartX = 0, touchStartY = 0;
lightbox.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].clientX; touchStartY = e.changedTouches[0].clientY; }, { passive: true });
lightbox.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepLightbox(dx < 0 ? 1 : -1);
}, { passive: true });
}

/* ============================================================
   ROOMS + AVAILABILITY CALENDAR ("from – to")
   ============================================================ */
const availCache = {};

function expandRanges(ranges, set, from, to) {
  (ranges || []).forEach(r => {
    if (!r || r.length < 2) return;
    let d = r[0] < from ? from : r[0];
    const end = r[1] > to ? to : r[1];
    for (let guard = 0; d <= end && guard < 900; guard++) { set.add(d); d = addDaysISO(d, 1); }
  });
}

// Which dates are taken for a room. Uses /api/availability?room=ID when your server provides it,
// otherwise falls back to the `booked` list in ROOMS above.
async function loadAvailability(room) {
  const cached = availCache[room.id];
  if (cached && Date.now() - cached.t < 60000) return cached.set;
  let booked = room.booked;
  try {
    if (location.protocol === 'file:') throw new Error('opened from a folder, no server'); // avoids a console error when testing locally
    const res = await fetch(API + '/api/availability?room=' + encodeURIComponent(room.id));
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.booked)) booked = data.booked;
    }
  } catch (_) { /* no server yet: use the list above */ }
  const from = addDaysISO(todayISO(), -1);
  const to = addDaysISO(todayISO(), room.advanceDays + room.maxNights + 2);
  const set = new Set();
  expandRanges(booked, set, from, to);
  expandRanges(room.closed, set, from, to);
  availCache[room.id] = { t: Date.now(), set };
  return set;
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function nightsBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

function createRangeCalendar(root, onChange) {
  const st = { room: null, blocked: new Set(), start: null, end: null, hover: null, maxEnd: null, loading: false, y: 0, m: 0 };

  root.textContent = '';
  const prev = el('button', 'cal-nav', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous month');
  const next = el('button', 'cal-nav', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Next month');
  const title = el('div', 'cal-title'); title.setAttribute('aria-live', 'polite');
  const head = el('div', 'cal-head'); head.append(prev, title, next);
  const dow = el('div', 'cal-dow'); dow.setAttribute('aria-hidden', 'true');
  ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => dow.appendChild(el('span', null, d)));
  const grid = el('div', 'cal-grid');
  const status = el('p', 'cal-status'); status.setAttribute('aria-live', 'polite');
  const legend = el('div', 'cal-legend');
  legend.innerHTML = '<span><i class="lg-free"></i>Available</span><span><i class="lg-booked"></i>Unavailable</span><span><i class="lg-sel"></i>Your stay</span>';
  const clear = el('button', 'cal-clear', 'Clear dates'); clear.type = 'button';
  const foot = el('div', 'cal-foot'); foot.append(legend, clear);
  root.append(head, dow, grid, status, foot);

  const maxDate = () => addDaysISO(todayISO(), st.room ? st.room.advanceDays : 0);
  const free = iso => iso >= todayISO() && iso <= maxDate() && !st.blocked.has(iso);
  const canStart = iso => { for (let i = 0; i <= st.room.minNights; i++) if (!free(addDaysISO(iso, i))) return false; return true; };
  const computeMaxEnd = start => {
    let last = start;
    for (let n = 1; n <= st.room.maxNights; n++) { const d = addDaysISO(start, n); if (!free(d)) break; last = d; }
    return last;
  };
  const choosingEnd = () => st.start && !st.end;
  const validEnd = iso => choosingEnd() && iso >= addDaysISO(st.start, st.room.minNights) && iso <= st.maxEnd;

  function dayState(iso) {
    if (!st.room || st.loading) return { c: 'idle', off: true, why: st.loading ? 'Loading' : 'Choose a room first' };
    if (iso < todayISO()) return { c: 'past', off: true, why: 'Past date' };
    if (iso > maxDate()) return { c: 'far', off: true, why: 'Not open for booking yet' };
    if (st.blocked.has(iso)) return { c: 'booked', off: true, why: 'Unavailable' };
    const shortMsg = 'Not enough free nights from this date';
    if (!choosingEnd() || iso < st.start) return canStart(iso) ? { c: '', off: false } : { c: 'short', off: true, why: shortMsg };
    if (iso === st.start) return { c: '', off: false };
    if (iso < addDaysISO(st.start, st.room.minNights)) return { c: 'near', off: true, why: 'Minimum stay is ' + plural(st.room.minNights, 'night') };
    if (iso > st.maxEnd) return { c: 'beyond', off: true, why: 'Longer than the maximum stay or runs into an unavailable date' };
    return { c: '', off: false };
  }

  function render() {
    const first = new Date(st.y, st.m, 1);
    title.textContent = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    grid.textContent = '';
    for (let i = 0; i < first.getDay(); i++) grid.appendChild(el('span', 'cal-blank'));
    const count = new Date(st.y, st.m + 1, 0).getDate();
    for (let d = 1; d <= count; d++) {
      const iso = st.y + '-' + pad2(st.m + 1) + '-' + pad2(d);
      const s = dayState(iso);
      const b = el('button', 'cal-day' + (s.c ? ' ' + s.c : '') + (iso === todayISO() ? ' today' : ''), String(d));
      b.type = 'button'; b.dataset.iso = iso; b.disabled = s.off;
      b.setAttribute('aria-label', fmtDate(iso) + (s.why ? ', ' + s.why : ''));
      grid.appendChild(b);
    }
    const nowY = new Date().getFullYear(), nowM = new Date().getMonth();
    prev.disabled = st.y === nowY && st.m === nowM;
    const lastDay = new Date(st.y, st.m + 1, 1); // first day of next month
    next.disabled = !st.room || toISODate(lastDay) > maxDate();
    clear.hidden = !st.start;
    paint(); updateStatus();
  }

  function paint() {
    const rangeEnd = st.end || (st.hover && validEnd(st.hover) ? st.hover : null);
    grid.querySelectorAll('.cal-day').forEach(b => {
      const iso = b.dataset.iso;
      const isStart = iso === st.start, isEnd = !!rangeEnd && iso === rangeEnd;
      b.classList.toggle('sel-start', isStart);
      b.classList.toggle('sel-end', isEnd && !!st.end);
      b.classList.toggle('hover-end', isEnd && !st.end);
      b.classList.toggle('in-range', !!st.start && !!rangeEnd && iso > st.start && iso < rangeEnd);
      b.setAttribute('aria-pressed', isStart || (!!st.end && iso === st.end) ? 'true' : 'false');
    });
  }

  function updateStatus() {
    let msg;
    if (!st.room) msg = 'Choose a room above to see its available dates.';
    else if (st.loading) msg = 'Checking availability…';
    else if (!st.start) msg = 'Select your check-in date. ' + plural(st.room.minNights, 'night') + ' minimum, ' + plural(st.room.maxNights, 'night') + ' maximum.';
    else if (!st.end) msg = 'Check-in ' + fmtDate(st.start) + '. Now select your check-out date.';
    else { const n = nightsBetween(st.start, st.end); msg = fmtDate(st.start) + '  →  ' + fmtDate(st.end) + '  ·  ' + plural(n, 'night'); }
    status.textContent = msg;
    status.classList.toggle('has-range', !!st.end);
  }

  function emit() { onChange({ start: st.start, end: st.end, nights: st.start && st.end ? nightsBetween(st.start, st.end) : 0 }); }
  function goToStartMonth() { const d = new Date(); st.y = d.getFullYear(); st.m = d.getMonth(); }

  grid.addEventListener('click', e => {
    const b = e.target.closest('.cal-day');
    if (!b || b.disabled) return;
    const iso = b.dataset.iso;
    if (!choosingEnd() || iso < st.start) { st.start = iso; st.end = null; st.maxEnd = computeMaxEnd(iso); }
    else if (iso === st.start) { st.start = null; st.end = null; }
    else { st.end = iso; }
    st.hover = null;
    emit(); render();
  });
  grid.addEventListener('mouseover', e => {
    const b = e.target.closest('.cal-day');
    if (!b || b.disabled || !choosingEnd()) return;
    if (st.hover !== b.dataset.iso) { st.hover = b.dataset.iso; paint(); }
  });
  grid.addEventListener('mouseleave', () => { if (st.hover) { st.hover = null; paint(); } });
  prev.addEventListener('click', () => { st.m--; if (st.m < 0) { st.m = 11; st.y--; } render(); });
  next.addEventListener('click', () => { st.m++; if (st.m > 11) { st.m = 0; st.y++; } render(); });
  clear.addEventListener('click', () => { st.start = st.end = st.hover = null; emit(); render(); });

  goToStartMonth(); render();

  return {
    async setRoom(room) {
      st.room = room || null; st.start = st.end = st.hover = null; st.blocked = new Set();
      emit();
      if (!room) { st.loading = false; goToStartMonth(); render(); return; }
      st.loading = true; goToStartMonth(); render();
      const set = await loadAvailability(room);
      if (st.room !== room) return; // the guest picked another room meanwhile
      st.blocked = set; st.loading = false; render();
    },
    rerender() { render(); },
    getValue() { return { start: st.start, end: st.end, nights: st.start && st.end ? nightsBetween(st.start, st.end) : 0 }; },
  };
}

const guestCount = v => parseInt(v, 10) || 0;

function setupRoomPicker({ select, info, guests, cal }) {
  const roomOf = id => ROOMS.find(r => r.id === id);
  function fill() {
    const g = guestCount(guests.value);
    select.textContent = '';
    const ph = el('option', null, 'Select a room'); ph.value = '';
    select.appendChild(ph);
    ROOMS.forEach(r => {
      const tooSmall = g > r.capacity;
      const o = el('option', null, r.name + ' (sleeps ' + r.capacity + ')' + (tooSmall ? ' – too small for your group' : ''));
      o.value = r.id; o.disabled = tooSmall;
      select.appendChild(o);
    });
  }
  function describe() {
    const r = roomOf(select.value);
    info.textContent = r
      ? 'Sleeps up to ' + r.capacity + ' · ' + r.minNights + '–' + plural(r.maxNights, 'night') + ' per stay · book up to ' + r.advanceDays + ' days ahead' + (r.note ? ' · ' + r.note : '')
      : '';
  }
  function onRoomChange() { describe(); cal.setRoom(roomOf(select.value) || null); }
  function refresh() {
    const prevValue = select.value;
    fill();
    select.value = prevValue;
    if (prevValue && select.value !== prevValue) { select.value = ''; onRoomChange(); showToast('That room is too small for your group. Please choose another.'); }
  }
  select.addEventListener('change', onRoomChange);
  guests.addEventListener('change', refresh);
  fill();
  return {
    refresh,
    reset() { select.value = ''; describe(); cal.setRoom(null); },
    getRoom() { return roomOf(select.value) || null; },
  };
}

// Used by both booking forms: needs a room and a full from–to range.
function validateStay(picker, cal, select) {
  if (!picker.getRoom()) return invalid(select, 'Please choose a room.');
  const v = cal.getValue();
  if (!v.start || !v.end) {
    showToast('Please choose your check-in and check-out dates on the calendar.');
    return false;
  }
  return true;
}

/* ============================================================
   BOOKING FLOW (full page)
   ============================================================ */
const bkCheckin = $('bk-checkin'), bkCheckout = $('bk-checkout');
let bookingCal = null, bookingRooms = null;
if ($('bk-cal')) { // Bookings page only
  bookingCal = createRangeCalendar($('bk-cal'), v => { bkCheckin.value = v.start || ''; bkCheckout.value = v.end || ''; });
  bookingRooms = setupRoomPicker({ select: $('bk-room'), info: $('bk-room-info'), guests: $('bk-guests'), cal: bookingCal });
}

function setStep(n) {
  [1, 2, 3].forEach(i => { $('booking-step-' + i).style.display = i === n ? 'block' : 'none'; });
  document.querySelectorAll('.booking-step').forEach((s, i) => s.classList.toggle('active', i < n));
  if (n === 2) bookingRooms.refresh();
  const wrap = document.querySelector('.booking-wrapper');
  if (wrap) {
    const top = wrap.getBoundingClientRect().top + window.scrollY - (navbar.offsetHeight + 12);
    if (window.scrollY > top) window.scrollTo({ top, behavior: smooth() });
  }
}

function addSummaryRow(box, label, value) {
  const b = el('b', null, label + ': ');
  box.append(b, document.createTextNode(value), document.createElement('br'));
}

async function bookingNextStep(current) {
  if (current === 1) {
    if (!validateName($('bk-name')) || !validateEmail($('bk-email')) || !validatePhone($('bk-phone'))) return;
    if (!$('bk-guests').value) { invalid($('bk-guests'), 'Please select the number of guests.'); return; }
    setStep(2);
    return;
  }
  if (current === 2) {
    if (!validateStay(bookingRooms, bookingCal, $('bk-room'))) return;
    const room = bookingRooms.getRoom();
    const btn = $('bk-submit-btn');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Sending…';
    const slot = document.querySelector('.slot-btn.selected');
    const res = await postJSON('/api/bookings', {
      name: $('bk-name').value.trim(),
      email: $('bk-email').value.trim(),
      phone: $('bk-phone').value.trim(),
      guests: $('bk-guests').value,
      roomId: room.id,
      roomName: room.name,
      nights: bookingCal.getValue().nights,
      occasion: $('bk-occasion').value,
      checkIn: bkCheckin.value,
      checkOut: bkCheckout.value,
      timeSlot: slot ? slot.textContent : '',
      requests: $('bk-requests').value.trim(),
    });
    btn.disabled = false; btn.textContent = label;
    if (!res.ok) { showToast(res.error); return; }

    const box = $('confirm-summary');
    box.textContent = '';
    addSummaryRow(box, 'Guest', $('bk-name').value.trim() || 'Guest');
    addSummaryRow(box, 'Email', $('bk-email').value.trim() || '—');
    addSummaryRow(box, 'Room', room.name);
    addSummaryRow(box, 'Check-in', fmtDate(bkCheckin.value));
    addSummaryRow(box, 'Check-out', fmtDate(bkCheckout.value));
    addSummaryRow(box, 'Nights', String(bookingCal.getValue().nights));
    addSummaryRow(box, 'Guests', $('bk-guests').value || '—');
    addSummaryRow(box, 'Occasion', $('bk-occasion').value || 'Leisure Stay');
    setStep(3);
    $('booking-confirm').classList.add('show');
    document.querySelectorAll('.booking-step').forEach(s => s.classList.add('active'));
  }
}
function bookingPrevStep(current) { setStep(current - 1); }
function resetBooking() {
  $('booking-confirm').classList.remove('show');
  $('booking-form').reset();
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  bookingRooms.reset();
  setStep(1);
}
function selectSlot(btn) {
  if (btn.classList.contains('unavailable')) return;
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}
if ($('booking-form')) $('booking-form').addEventListener('submit', e => e.preventDefault());

/* ============================================================
   CONTACT FORM
   ============================================================ */
if ($('contact-form')) $('contact-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('ct-name'), email = $('ct-email'), subject = $('ct-subject'), msg = $('ct-msg');
  if (!validateName(name) || !validateEmail(email) || !validateFilled(subject, 'Please add a subject.') || !validateFilled(msg, 'Please write your message.')) return;
  const btn = e.target.querySelector('.submit-btn');
  btn.disabled = true;
  const res = await postJSON('/api/contact', {
    name: name.value.trim(), email: email.value.trim(), phone: $('ct-phone').value.trim(),
    subject: subject.value.trim(), message: msg.value.trim(),
  });
  btn.disabled = false;
  if (!res.ok) { showToast(res.error); return; }
  $('contact-form').style.display = 'none';
  $('contact-success').classList.add('show');
});

/* ============================================================
   QUICK-RESERVATION MODAL
   ============================================================ */
const modal = $('booking-modal');
const mCheckin = $('m-checkin'), mCheckout = $('m-checkout');
const modalCal = createRangeCalendar($('m-cal'), v => { mCheckin.value = v.start || ''; mCheckout.value = v.end || ''; });
const modalRooms = setupRoomPicker({ select: $('m-room'), info: $('m-room-info'), guests: $('m-guests'), cal: modalCal });
let modalReturnFocus = null;

function openModal() {
  closeMobileNav();
  modalCal.rerender();
  modalReturnFocus = document.activeElement;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  setScrollLock('modal', true);
  if (finePointer) $('m-name').focus(); // on phones, focusing would pop the keyboard straight away
}
function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  setScrollLock('modal', false);
  if (modalReturnFocus && modalReturnFocus.focus) modalReturnFocus.focus();
}
modal.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
$('modal-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('m-name'), email = $('m-email'), guests = $('m-guests');
  if (!validateName(name) || !validateEmail(email)) return;
  if (!guests.value) { invalid(guests, 'Please select the number of guests.'); return; }
  if (!validateStay(modalRooms, modalCal, $('m-room'))) return;
  const room = modalRooms.getRoom();
  const btn = e.target.querySelector('.submit-btn');
  btn.disabled = true;
  const res = await postJSON('/api/bookings', {
    name: name.value.trim(), email: email.value.trim(),
    checkIn: mCheckin.value, checkOut: mCheckout.value, guests: guests.value,
    roomId: room.id, roomName: room.name, nights: modalCal.getValue().nights,
  });
  btn.disabled = false;
  if (!res.ok) { showToast(res.error); return; }
  $('modal-form').style.display = 'none';
  $('modal-success').classList.add('show');
});

/* ============================================================
   NEWSLETTER
   ============================================================ */
async function subscribeNewsletter() {
  const input = $('nl-email');
  if (!emailRe.test(input.value.trim())) { input.style.borderColor = '#e05050'; showToast('Please enter a valid email address.'); return; }
  input.style.borderColor = '';
  const res = await postJSON('/api/newsletter', { email: input.value.trim() });
  if (!res.ok) { input.style.borderColor = '#e05050'; showToast(res.error); return; }
  document.querySelector('.newsletter-form').style.display = 'none';
  $('nl-success').style.display = 'block';
}
$('nl-email').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); subscribeNewsletter(); } });
$('nl-email').addEventListener('input', e => { e.target.style.borderColor = ''; });

/* ============================================================
   CHAT FAQ
   ============================================================ */
const chatBox = $('chat-box'), chatToggle = $('chat-toggle'), chatInput = $('chat-input'), chatSend = $('chat-send');
let chatGreeted = false;
function setChat(open) {
  chatBox.classList.toggle('open', open);
  chatBox.setAttribute('aria-hidden', String(!open));
  chatToggle.setAttribute('aria-expanded', String(open));
  setScrollLock('chat', open);
  if (open) {
    if (!chatGreeted) { chatGreeted = true; addMessage('Hello! Ask us anything about rooms, food, check-in or how to reach us.', 'bot'); }
    if (finePointer) chatInput.focus();
  }
}
chatToggle.addEventListener('click', () => setChat(!chatBox.classList.contains('open')));
$('chat-close').addEventListener('click', () => setChat(false));

function addMessage(text, from) {
  const messages = $('chat-messages');
  const div = el('div', 'msg ' + from, text);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}
function showTyping() {
  const messages = $('chat-messages');
  const div = el('div', 'msg bot');
  div.id = 'typing-indicator';
  div.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}
function removeTyping() { const t = $('typing-indicator'); if (t) t.remove(); }

let chatBusy = false;
async function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message || chatBusy) return;
  chatBusy = true; chatSend.disabled = true;
  addMessage(message, 'user');
  chatInput.value = '';
  showTyping();
  const res = await postJSON('/api/chat', { message });
  await new Promise(r => setTimeout(r, 400));
  removeTyping();
  if (res.ok && res.data && res.data.reply) addMessage(res.data.reply, 'bot');
  else addMessage('Sorry, I could not connect just now. Please call or WhatsApp us and we will be happy to help.', 'bot');
  chatBusy = false; chatSend.disabled = false;
}
chatSend.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendChatMessage(); } });

/* ============================================================
   HOME PAGE: ROOMS PREVIEW + DELAYED BOOK BUTTON
   ============================================================ */
function renderRoomsPreview() {
  const grid = $('rooms-grid');
  if (!grid) return; // home page only
  grid.textContent = '';
  ROOMS.forEach(r => {
    const card = el('div', 'room-card reveal');
    const meta = el('p', 'room-meta', 'Sleeps up to ' + r.capacity + '  ·  ' + r.minNights + '–' + plural(r.maxNights, 'night'));
    const link = el('a', 'btn-outline', 'Check Availability →');
    link.href = 'bookings.html';
    link.setAttribute('aria-label', 'Check availability for ' + r.name);
    card.append(el('div', 'room-icon', '🛏️'), el('h3', 'room-name', r.name), meta, el('p', 'room-note', r.note || ''), link);
    card.firstChild.setAttribute('aria-hidden', 'true');
    grid.appendChild(card);
    observeReveal(card);
  });
}
renderRoomsPreview();

// On the home page the floating "Book Now" button only appears once visitors scroll down to the rooms.
(function delayedBookButton() {
  const target = $('rooms-preview');
  if (currentPage !== 'home' || !target) return;
  const check = () => document.body.classList.toggle('book-visible', target.getBoundingClientRect().top < window.innerHeight * 0.85);
  window.addEventListener('scroll', rafThrottle(check), { passive: true });
  window.addEventListener('resize', rafThrottle(check));
  check();
})();

/* ============================================================
   ESCAPE KEY + YEAR + PAGE START-UP
   ============================================================ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (lightbox && lightbox.classList.contains('open')) closeLightbox();
    else if (modal.classList.contains('open')) closeModal();
    else if (chatBox.classList.contains('open')) setChat(false);
    else if (mobileNav.classList.contains('open')) closeMobileNav();
  }
  if (lightbox && lightbox.classList.contains('open')) {
    if (e.key === 'ArrowLeft')  stepLightbox(-1);
    if (e.key === 'ArrowRight') stepLightbox(1);
  }
});

$('year').textContent = new Date().getFullYear();

// When the farmstay server is running, it decides the rooms (names, sizes, rules, closed dates).
// Without a server (for example when previewing the files from a folder) the ROOMS list at the top of this file is used.
async function syncRoomsFromServer() {
  if (location.protocol === 'file:') return;
  try {
    const res = await fetch(API + '/api/rooms', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !Array.isArray(data.rooms) || !data.rooms.length) return;
    ROOMS.splice(0, ROOMS.length, ...data.rooms.map(r => Object.assign({ booked: [], closed: [] }, r)));
    Object.keys(availCache).forEach(k => delete availCache[k]);
    if (bookingRooms) bookingRooms.refresh();
    if (modalRooms) modalRooms.refresh();
    renderRoomsPreview();
  } catch (_) { /* no server: keep the built-in list */ }
}
syncRoomsFromServer();

// Gallery page: build the photo grid
if ($('masonry-grid')) initGallery();
