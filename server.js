'use strict';
/* ============================================================
   Mar Me Yullong Farmstay - website + owner panel server
   - serves the website from /public
   - stores booking requests in data/db.json
   - gives the website its room list and which dates are taken
   - protects the owner panel (/admin/) with a password
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
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ nextRef: 1001, bookings: [], blocks: [] }, null, 2));
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const SECRET = fs.readFileSync(secretFile, 'utf8').trim();

let db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
db.bookings = db.bookings || []; db.blocks = db.blocks || []; db.nextRef = db.nextRef || 1001;
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
  res.status(201).json({ ok: true, ref });
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

app.use('/api/admin', admin);

// features that are not set up yet answer politely instead of crashing the page
app.all('/api/*', (req, res) => bad(res, "This feature isn't set up yet. Please call or WhatsApp us.", 501));

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
  console.log('  Owner panel:  http://localhost:' + PORT + '/admin/\n');
});
