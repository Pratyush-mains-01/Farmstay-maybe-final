'use strict';
/* ============================================================
   Mar Me Yullong Farmstay - website + owner panel server
   - serves the website from /public
   - stores booking requests in data/db.json
   - gives the website its room list and which dates are taken
   - protects the owner panel (/admin/) with a password
   - guest reviews (live straight away; the owner can delete any), contact messages,
     newsletter sign-ups and the FAQ chat
   - emails the owner about new activity (Resend)
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

/* ---------- tiny .env loader (no extra package needed) ---------- */
(function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

/* ---------- settings ---------- */
const PORT = Number(process.env.PORT) || 3000;
const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || path.join(__dirname, 'public'));
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const SESSION_DAYS = 7;
// Email alerts to the owner (optional). Leave RESEND_API_KEY empty to switch them off.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const MAIL_FROM = process.env.MAIL_FROM || 'Farmstay Website <onboarding@resend.dev>';

if (ADMIN_PASSWORD.length < 8 || ADMIN_PASSWORD === 'change-this-password') {
  console.error('\n  The owner password is not set.\n  Copy ".env.example" to ".env" and set ADMIN_PASSWORD (at least 8 characters), then start again.\n');
  process.exit(1);
}

/* ---------- files: rooms, bookings, secret ---------- */
const DEFAULT_ROOMS = [
  { id: 'garden',   name: 'Garden View Room',   capacity: 2, minNights: 1, maxNights: 14, advanceDays: 365, note: 'Quiet room facing the garden',          closed: [] },
  { id: 'mountain', name: 'Mountain View Room', capacity: 3, minNights: 2, maxNights: 7,  advanceDays: 270, note: 'Wide windows with hill views',          closed: [] },
  { id: 'family',   name: 'Family Suite',       capacity: 5, minNights: 2, maxNights: 10, advanceDays: 180, note: 'Spacious suite for families and groups', closed: [] },
];
fs.mkdirSync(DATA_DIR, { recursive: true });
const roomsFile = path.join(DATA_DIR, 'rooms.json');
const dbFile = path.join(DATA_DIR, 'db.json');
const secretFile = path.join(DATA_DIR, '.secret');
if (!fs.existsSync(roomsFile)) fs.writeFileSync(roomsFile, JSON.stringify(DEFAULT_ROOMS, null, 2));
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ nextRef: 1001, bookings: [], blocks: [], reviews: [], messages: [], subscribers: [] }, null, 2));
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const SECRET = fs.readFileSync(secretFile, 'utf8').trim();

let db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
db.bookings = db.bookings || []; db.blocks = db.blocks || []; db.nextRef = db.nextRef || 1001;
db.reviews = db.reviews || []; db.messages = db.messages || []; db.subscribers = db.subscribers || [];
function save() {
  try { fs.copyFileSync(dbFile, dbFile.replace('.json', '.backup.json')); } catch (_) { /* first save */ }
  const tmp = dbFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbFile);
}

// rooms.json can be edited by hand; changes are picked up automatically
let roomsCache = { mtime: 0, list: DEFAULT_ROOMS };
function getRooms() {
  try {
    const st = fs.statSync(roomsFile);
    if (st.mtimeMs !== roomsCache.mtime) {
      const list = JSON.parse(fs.readFileSync(roomsFile, 'utf8'));
      if (!Array.isArray(list) || !list.every(r => r && r.id && r.name && Number(r.capacity) > 0)) throw new Error('each room needs an id, name and capacity');
      roomsCache = { mtime: st.mtimeMs, list: list.map(r => ({
        id: String(r.id), name: String(r.name), capacity: Number(r.capacity),
        minNights: Number(r.minNights) || 1, maxNights: Number(r.maxNights) || 14, advanceDays: Number(r.advanceDays) || 365,
        note: String(r.note || ''), closed: Array.isArray(r.closed) ? r.closed : [],
      })) };
    }
  } catch (e) { console.error('Problem reading data/rooms.json (keeping the previous rooms):', e.message); }
  return roomsCache.list;
}

/* ---------- date + text helpers (dates are plain YYYY-MM-DD) ---------- */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validISO = s => { if (typeof s !== 'string' || !ISO.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
const niceDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const niceRange = (a, b) => (a === b ? niceDate(a) : niceDate(a) + ' to ' + niceDate(b));
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
const cleanLine = (s, max) => clean(s, max).replace(/\s*\n\s*/g, ' ');
const overlaps = (a1, a2, b1, b2) => a1 <= b2 && b1 <= a2;
const parseGuests = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 0; };

/* A date range is taken when a CONFIRMED booking, an owner block, or a closed period covers any of its days. */
function findClash(roomId, from, to, ignoreId) {
  const room = getRooms().find(r => r.id === roomId);
  for (const b of db.bookings) {
    if (b.roomId === roomId && b.status === 'confirmed' && b.id !== ignoreId && overlaps(from, to, b.checkIn, b.checkOut)) {
      return { kind: 'booking', text: b.name + "'s booking (" + niceRange(b.checkIn, b.checkOut) + ')' };
    }
  }
  for (const k of db.blocks) {
    if (k.roomId === roomId && overlaps(from, to, k.from, k.to)) {
      return { kind: 'block', text: 'a blocked period (' + niceRange(k.from, k.to) + (k.reason ? ', ' + k.reason : '') + ')' };
    }
  }
  for (const c of (room && room.closed) || []) {
    if (Array.isArray(c) && validISO(c[0]) && validISO(c[1]) && overlaps(from, to, c[0], c[1])) {
      return { kind: 'closed', text: 'a period this room is closed (' + niceRange(c[0], c[1]) + ')' };
    }
  }
  return null;
}

/* ---------- small helpers: rate limit, cookies, sessions ---------- */
function limiter(max, windowMs, message) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, 60000).unref();
  return (req, res, next) => {
    const now = Date.now();
    let h = hits.get(req.ip);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(req.ip, h); }
    h.n++;
    if (h.n > max) return res.status(429).json({ error: message });
    next();
  };
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
const sign = payload => crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
function makeToken() { const exp = String(Date.now() + SESSION_DAYS * 86400000); return exp + '.' + sign(exp); }
function validToken(t) {
  if (!t || t.indexOf('.') < 0) return false;
  const [exp, sig] = t.split('.');
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const want = sign(exp);
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}
function setSessionCookie(req, res, token, maxAgeSec) {
  const secure = COOKIE_SECURE || req.secure;
  res.setHeader('Set-Cookie', 'mmy_admin=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAgeSec + (secure ? '; Secure' : ''));
}
function requireAuth(req, res, next) {
  if (validToken(parseCookies(req).mmy_admin)) return next();
  res.status(401).json({ error: 'Please log in.' });
}

/* ---------- email alerts to the owner (Resend) ---------- */
// Never blocks or breaks a guest's request: if the email fails, the problem is only written to the server log.
function notifyOwner(subject, text, replyTo) {
  if (!RESEND_API_KEY || !ADMIN_EMAIL) return;
  const payload = { from: MAIL_FROM, to: [ADMIN_EMAIL], subject: cleanLine(subject, 150), text };
  if (replyTo && EMAIL.test(replyTo)) payload.reply_to = replyTo;
  fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  }).then(async r => {
    if (!r.ok) console.error('Email alert FAILED (' + r.status + '): ' + (await r.text()).slice(0, 300));
  }).catch(e => console.error('Email alert FAILED: ' + e.message));
}

/* ---------- FAQ chat ----------
   Check every answer below is TRUE for your farmstay: guests will read these as facts.
   The first matching keyword wins, so put the more specific ones first. */
const FAQS = [
  { keywords: ['check in', 'checkin', 'check-in', 'arrive', 'arrival'], answer: 'Check-in is from 2:00 PM. Let us know if you need to arrive earlier.' },
  { keywords: ['check out', 'checkout', 'check-out'], answer: 'Check-out is by 11:00 AM.' },
  { keywords: ['pet', 'dog', 'cat'], answer: 'We currently do not allow pets, with the exception of service animals.' },
  { keywords: ['breakfast', 'food', 'meal'], answer: 'Breakfast is included with every stay, served 8-10 AM.' },
  { keywords: ['wifi', 'wi-fi', 'internet'], answer: 'Yes, free WiFi is available throughout the property.' },
  { keywords: ['parking', 'car'], answer: 'Free on-site parking is available for all guests.' },
  { keywords: ['cancel', 'refund'], answer: 'Cancellations made 48 hours before check-in are fully refundable.' },
  { keywords: ['price', 'cost', 'rate', 'how much'], answer: 'Rates vary by season and room type. Please check our Bookings page or contact us for exact pricing.' },
  { keywords: ['availability', 'available', 'vacancy'], answer: 'You can check availability directly on our Bookings page by selecting your dates.' },
  { keywords: ['contact', 'phone', 'number', 'reach'], answer: 'You can reach us via the Contact page or the WhatsApp button on the site.' },
];
const FAQ_FALLBACK = "I'm not sure about that one. Please reach out through our Contact page or WhatsApp and we'll help directly!";
function matchFaq(message) {
  const text = message.toLowerCase();
  const hit = FAQS.find(f => f.keywords.some(k => text.includes(k)));
  return hit ? hit.answer : FAQ_FALLBACK;
}
const monthYear = iso => new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: TIMEZONE });

/* ---------- app ---------- */
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.path.startsWith('/admin') || req.path.startsWith('/api/admin')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  }
  next();
});
app.use(express.json({ limit: '20kb' }));

const bad = (res, msg, status) => res.status(status || 400).json({ error: msg });

/* ============================================================
   PUBLIC API (used by the website)
   ============================================================ */
app.get('/api/rooms', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ rooms: getRooms() });
});

// Only dates are returned (never guest details): confirmed bookings + owner blocks that haven't finished yet.
app.get('/api/availability', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const roomId = String(req.query.room || '');
  if (!getRooms().some(r => r.id === roomId)) return bad(res, 'Unknown room.', 404);
  const t = today();
  const booked = [];
  db.bookings.forEach(b => { if (b.roomId === roomId && b.status === 'confirmed' && b.checkOut >= t) booked.push([b.checkIn, b.checkOut]); });
  db.blocks.forEach(k => { if (k.roomId === roomId && k.to >= t) booked.push([k.from, k.to]); });
  booked.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  res.json({ booked });
});

const bookingLimiter = limiter(8, 3600000, 'Too many requests from this connection. Please try again later, or call or WhatsApp us.');
app.post('/api/bookings', bookingLimiter, (req, res) => {
  const b = req.body || {};
  const room = getRooms().find(r => r.id === b.roomId);
  if (!room) return bad(res, 'Please choose a room.');
  const name = cleanLine(b.name, 80);
  if (name.length < 2) return bad(res, 'Please enter your name.');
  const email = cleanLine(b.email, 120).toLowerCase();
  if (!EMAIL.test(email)) return bad(res, 'Please enter a valid email address.');
  const phone = cleanLine(b.phone, 30);
  if (phone && phone.replace(/\D/g, '').length < 7) return bad(res, 'Please enter a valid phone number.');
  const guests = parseGuests(b.guests);
  if (!guests) return bad(res, 'Please select the number of guests.');
  if (guests > room.capacity) return bad(res, room.name + ' sleeps up to ' + room.capacity + ' guests. Please choose a larger room.');
  const t = today();
  if (!validISO(b.checkIn) || !validISO(b.checkOut)) return bad(res, 'Please choose your dates.');
  if (b.checkIn < t) return bad(res, 'Check-in cannot be in the past.');
  if (b.checkIn > addDays(t, room.advanceDays)) return bad(res, 'That date is too far ahead to book for this room.');
  const nights = diffDays(b.checkIn, b.checkOut);
  if (nights < room.minNights) return bad(res, room.name + ' needs a stay of at least ' + room.minNights + (room.minNights === 1 ? ' night.' : ' nights.'));
  if (nights > room.maxNights) return bad(res, room.name + ' allows stays of up to ' + room.maxNights + ' nights.');
  if (findClash(room.id, b.checkIn, b.checkOut)) return bad(res, 'Sorry, those dates are no longer available for this room. Please choose different dates.', 409);

  // the same person pressing the button twice should not create two requests
  const dupe = db.bookings.find(x => x.status === 'pending' && x.email === email && x.roomId === room.id && x.checkIn === b.checkIn && x.checkOut === b.checkOut);
  if (dupe) return res.status(200).json({ ok: true, ref: dupe.ref });

  const ref = 'MMY-' + db.nextRef++;
  db.bookings.push({
    id: crypto.randomBytes(6).toString('hex'), ref, status: 'pending', source: 'website', createdAt: new Date().toISOString(),
    name, email, phone, guests, roomId: room.id, checkIn: b.checkIn, checkOut: b.checkOut, nights,
    occasion: cleanLine(b.occasion, 40), timeSlot: cleanLine(b.timeSlot, 20), requests: clean(b.requests, 1000), note: '',
  });
  save();
  notifyOwner('New booking request ' + ref + ' from ' + name,
    ['A guest asked to book through the website. Open the owner panel to confirm or decline.', '',
     'Reference: ' + ref, 'Room: ' + room.name, 'Dates: ' + niceRange(b.checkIn, b.checkOut) + ' (' + nights + (nights === 1 ? ' night)' : ' nights)'),
     'Guests: ' + guests, 'Name: ' + name, 'Email: ' + email, 'Phone: ' + (phone || 'not given'),
     'Occasion: ' + (cleanLine(b.occasion, 40) || 'not given'), 'Arrival time: ' + (cleanLine(b.timeSlot, 20) || 'not given'),
     'Guest note: ' + (clean(b.requests, 1000) || 'none')].join('\n'), email);
  res.status(201).json({ ok: true, ref });
});

/* ---------- reviews ---------- */
// Every review is public as soon as it is sent, but only name, stars, text and month are shown (never the email).
app.get('/api/reviews', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const reviews = db.reviews.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map(r => ({ name: r.name, stars: r.stars, text: r.text, date: monthYear(r.createdAt) }));
  res.json({ reviews });
});
const reviewLimiter = limiter(5, 3600000, 'Too many reviews from this connection. Please try again later.');
app.post('/api/reviews', reviewLimiter, (req, res) => {
  const b = req.body || {};
  const name = cleanLine(b.name, 80);
  if (name.length < 2) return bad(res, 'Please enter your name.');
  const email = cleanLine(b.email, 120).toLowerCase();
  if (!EMAIL.test(email)) return bad(res, 'Please enter a valid email address.');
  const stars = Number(b.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return bad(res, 'Please choose a star rating from 1 to 5.');
  const text = clean(b.comment != null ? b.comment : b.text, 1000);
  if (text.length < 5) return bad(res, 'Please write a few words about your stay.');
  if (db.reviews.some(r => r.email === email && r.text === text)) return res.status(200).json({ ok: true });
  db.reviews.push({ id: crypto.randomBytes(6).toString('hex'), name, email, stars, text, createdAt: new Date().toISOString() });
  save();
  notifyOwner('New ' + stars + '-star review from ' + name,
    'This review is live on the website now. If you do not want it there, delete it in the owner panel (Messages & reviews tab).\n\n' + stars + ' stars\n' + name + ' <' + email + '>\n\n' + text, email);
  res.status(201).json({ ok: true });
});

/* ---------- contact form ---------- */
const contactLimiter = limiter(5, 3600000, 'Too many messages from this connection. Please try again later, or call or WhatsApp us.');
app.post('/api/contact', contactLimiter, (req, res) => {
  const b = req.body || {};
  const name = cleanLine(b.name, 80);
  if (name.length < 2) return bad(res, 'Please enter your name.');
  const email = cleanLine(b.email, 120).toLowerCase();
  if (!EMAIL.test(email)) return bad(res, 'Please enter a valid email address.');
  const phone = cleanLine(b.phone, 30);
  const subject = cleanLine(b.subject, 120);
  if (subject.length < 2) return bad(res, 'Please add a subject.');
  const message = clean(b.message, 2000);
  if (message.length < 5) return bad(res, 'Please write your message.');
  db.messages.push({ id: crypto.randomBytes(6).toString('hex'), name, email, phone, subject, message, done: false, createdAt: new Date().toISOString() });
  save();
  notifyOwner('New message: ' + subject, 'From: ' + name + ' <' + email + '>\nPhone: ' + (phone || 'not given') + '\n\n' + message, email);
  res.status(201).json({ ok: true });
});

/* ---------- newsletter ---------- */
const newsletterLimiter = limiter(10, 3600000, 'Too many sign-ups from this connection. Please try again later.');
app.post('/api/newsletter', newsletterLimiter, (req, res) => {
  const email = cleanLine(req.body && req.body.email, 120).toLowerCase();
  if (!EMAIL.test(email)) return bad(res, 'Please enter a valid email address.');
  if (!db.subscribers.some(x => x.email === email)) { // already subscribed: just say thank you again
    db.subscribers.push({ id: crypto.randomBytes(6).toString('hex'), email, createdAt: new Date().toISOString() });
    save();
    notifyOwner('New newsletter subscriber', 'New subscriber: ' + email);
  }
  res.status(201).json({ ok: true });
});

/* ---------- FAQ chat ---------- */
const chatLimiter = limiter(60, 600000, 'You are sending messages very fast. Please wait a moment.');
app.post('/api/chat', chatLimiter, (req, res) => {
  const message = cleanLine(req.body && req.body.message, 300);
  if (!message) return bad(res, 'Please type a message.');
  res.json({ reply: matchFaq(message) });
});

/* ============================================================
   OWNER API (needs the password)
   ============================================================ */
const loginLimiter = limiter(8, 15 * 60000, 'Too many tries. Please wait a few minutes and try again.');
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const given = String((req.body && req.body.password) || '');
  if (!crypto.timingSafeEqual(sha(given), sha(ADMIN_PASSWORD))) return bad(res, 'That password is not right. Please try again.', 401);
  setSessionCookie(req, res, makeToken(), SESSION_DAYS * 86400);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { setSessionCookie(req, res, '', 0); res.json({ ok: true }); });

const admin = express.Router();
admin.use(requireAuth);

admin.get('/me', (req, res) => res.json({ ok: true }));

admin.get('/data', (req, res) => {
  res.json({
    today: today(), rooms: getRooms(),
    bookings: db.bookings.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    blocks: db.blocks.slice().sort((a, b) => (a.from < b.from ? -1 : 1)),
    reviews: db.reviews.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    messages: db.messages.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    subscribers: db.subscribers.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  });
});

const find = id => db.bookings.find(b => b.id === id);

admin.post('/bookings/:id/confirm', (req, res) => {
  const b = find(req.params.id);
  if (!b) return bad(res, 'Booking not found.', 404);
  if (b.status === 'confirmed') return res.json({ ok: true, booking: b });
  if (b.status !== 'pending' && b.status !== 'declined') return bad(res, 'This booking cannot be confirmed any more.');
  if (b.checkOut < today()) return bad(res, 'These dates are already over.');
  const clash = findClash(b.roomId, b.checkIn, b.checkOut, b.id);
  if (clash) return bad(res, 'These dates overlap with ' + clash.text + '. Decline this request, or cancel the other one first.', 409);
  b.status = 'confirmed'; b.confirmedAt = new Date().toISOString();
  save();
  res.json({ ok: true, booking: b });
});

admin.post('/bookings/:id/decline', (req, res) => {
  const b = find(req.params.id);
  if (!b) return bad(res, 'Booking not found.', 404);
  if (b.status !== 'pending') return bad(res, 'Only new requests can be declined.');
  b.status = 'declined'; b.declinedAt = new Date().toISOString(); b.note = cleanLine(req.body && req.body.note, 300);
  save();
  res.json({ ok: true, booking: b });
});

admin.post('/bookings/:id/cancel', (req, res) => {
  const b = find(req.params.id);
  if (!b) return bad(res, 'Booking not found.', 404);
  if (b.status !== 'confirmed') return bad(res, 'Only confirmed bookings can be cancelled.');
  b.status = 'cancelled'; b.cancelledAt = new Date().toISOString(); b.note = cleanLine(req.body && req.body.note, 300);
  save();
  res.json({ ok: true, booking: b });
});

admin.delete('/bookings/:id', (req, res) => {
  const b = find(req.params.id);
  if (!b) return bad(res, 'Booking not found.', 404);
  const finished = b.checkOut < today();
  if (b.status === 'confirmed' && !finished) return bad(res, 'Cancel this booking first, then it can be removed.');
  db.bookings = db.bookings.filter(x => x.id !== b.id);
  save();
  res.json({ ok: true });
});

// the owner adds a booking taken by phone / walk-in: confirmed straight away
admin.post('/bookings', (req, res) => {
  const b = req.body || {};
  const room = getRooms().find(r => r.id === b.roomId);
  if (!room) return bad(res, 'Please choose a room.');
  const name = cleanLine(b.name, 80);
  if (name.length < 2) return bad(res, "Please enter the guest's name.");
  const phone = cleanLine(b.phone, 30);
  if (phone.replace(/\D/g, '').length < 7) return bad(res, "Please enter the guest's phone number.");
  const email = cleanLine(b.email, 120).toLowerCase();
  if (email && !EMAIL.test(email)) return bad(res, 'That email address does not look right.');
  if (!validISO(b.checkIn) || !validISO(b.checkOut)) return bad(res, 'Please choose both dates.');
  if (b.checkOut < b.checkIn) return bad(res, 'The last day must be the same as or after the first day.');
  if (b.checkOut < today()) return bad(res, 'These dates are already over.');
  const clash = findClash(room.id, b.checkIn, b.checkOut);
  if (clash) return bad(res, 'These dates overlap with ' + clash.text + '.', 409);
  const ref = 'MMY-' + db.nextRef++;
  const booking = {
    id: crypto.randomBytes(6).toString('hex'), ref, status: 'confirmed', source: 'owner', createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString(),
    name, email, phone, guests: parseGuests(b.guests) || 0, roomId: room.id, checkIn: b.checkIn, checkOut: b.checkOut, nights: diffDays(b.checkIn, b.checkOut),
    occasion: '', timeSlot: '', requests: '', note: clean(b.note, 300),
  };
  db.bookings.push(booking);
  save();
  res.status(201).json({ ok: true, booking });
});

// block dates (maintenance, family use...) for one room or all rooms
admin.post('/blocks', (req, res) => {
  const b = req.body || {};
  const rooms = getRooms();
  const targets = b.roomId === 'all' ? rooms : rooms.filter(r => r.id === b.roomId);
  if (!targets.length) return bad(res, 'Please choose a room.');
  if (!validISO(b.from) || !validISO(b.to)) return bad(res, 'Please choose both dates.');
  if (b.to < b.from) return bad(res, 'The last day must be the same as or after the first day.');
  if (b.to < today()) return bad(res, 'These dates are already over.');
  for (const r of targets) {
    const clash = findClash(r.id, b.from, b.to);
    if (clash && clash.kind === 'booking') return bad(res, r.name + ' already has ' + clash.text + ' in these dates.', 409);
  }
  const reason = cleanLine(b.reason, 80);
  const created = targets.map(r => {
    const blk = { id: crypto.randomBytes(6).toString('hex'), roomId: r.id, from: b.from, to: b.to, reason, createdAt: new Date().toISOString() };
    db.blocks.push(blk);
    return blk;
  });
  save();
  res.status(201).json({ ok: true, blocks: created });
});
admin.delete('/blocks/:id', (req, res) => {
  const before = db.blocks.length;
  db.blocks = db.blocks.filter(k => k.id !== req.params.id);
  if (db.blocks.length === before) return bad(res, 'Block not found.', 404);
  save();
  res.json({ ok: true });
});

// guest reviews: the owner can delete any of them
admin.delete('/reviews/:id', (req, res) => {
  const before = db.reviews.length;
  db.reviews = db.reviews.filter(x => x.id !== req.params.id);
  if (db.reviews.length === before) return bad(res, 'Review not found.', 404);
  save();
  res.json({ ok: true });
});
// contact messages: mark as dealt with, or delete
admin.post('/messages/:id/done', (req, res) => {
  const m = db.messages.find(x => x.id === req.params.id);
  if (!m) return bad(res, 'Message not found.', 404);
  m.done = !(req.body && req.body.done === false);
  save();
  res.json({ ok: true, message: m });
});
admin.delete('/messages/:id', (req, res) => {
  const before = db.messages.length;
  db.messages = db.messages.filter(x => x.id !== req.params.id);
  if (db.messages.length === before) return bad(res, 'Message not found.', 404);
  save();
  res.json({ ok: true });
});
admin.delete('/subscribers/:id', (req, res) => {
  const before = db.subscribers.length;
  db.subscribers = db.subscribers.filter(x => x.id !== req.params.id);
  if (db.subscribers.length === before) return bad(res, 'Subscriber not found.', 404);
  save();
  res.json({ ok: true });
});

app.use('/api/admin', admin);

// anything else under /api is not a real route
app.all('/api/*', (req, res) => bad(res, 'Not found.', 404));

/* ---------- the website itself ---------- */
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: 'index.html' }));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.use((err, req, res, next) => { // bad JSON etc.
  if (req.path.startsWith('/api/')) return bad(res, 'Something was wrong with that request.', err.status || 400);
  res.status(500).send('Something went wrong.');
});

app.listen(PORT, () => {
  console.log('\n  Mar Me Yullong Farmstay is running');
  console.log('  Website:      http://localhost:' + PORT + '/');
  console.log('  Owner panel:  http://localhost:' + PORT + '/admin/');
  console.log('  Email alerts: ' + (RESEND_API_KEY && ADMIN_EMAIL ? 'on (to ' + ADMIN_EMAIL + ')' : 'off (set RESEND_API_KEY and ADMIN_EMAIL to turn them on)') + '\n');
});
