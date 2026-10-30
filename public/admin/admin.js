'use strict';
/* ============================================================
   Owner panel for Mar Me Yullong Farmstay
   - New requests: confirm or decline
   - Confirmed bookings make the room unavailable on the website
   - When the last day has passed the room opens up again by itself
   ============================================================ */

const $ = id => document.getElementById(id);

// tiny helper to build elements safely (text is never treated as HTML)
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  kids.flat(Infinity).forEach(kid => { if (kid == null || kid === false) return; e.append(kid.nodeType ? kid : document.createTextNode(String(kid))); });
  return e;
}

/* ---------------- state ---------------- */
const state = {
  today: '', rooms: [], bookings: [], blocks: [], reviews: [], messages: [], subscribers: [], sig: '',
  tab: 'overview', filter: 'upcoming', search: '',
  calRoom: null, calY: 0, calM: 0, calDay: null,
};
let renderPending = false;

/* ---------------- talking to the server ---------------- */
class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
async function api(path, method, body) {
  let res;
  try {
    res = await fetch('/api/admin' + path, {
      method: method || 'GET', credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) { throw new ApiError("Can't reach the server. Please check the internet connection and try again.", 0); }
  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }
  if (res.status === 401 && path !== '/login') { showLogin('Your session ended. Please log in again.'); throw new ApiError('Please log in again.', 401); }
  if (!res.ok) throw new ApiError((data && data.error) || 'Something went wrong. Please try again.', res.status);
  return data;
}

/* ---------------- dates + text ---------------- */
const pad = n => String(n).padStart(2, '0');
const parseISO = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const toISO = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const nightsBetween = (a, b) => { const A = parseISO(a), B = parseISO(b); return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / 86400000); };
const fmt = iso => parseISO(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtFull = iso => parseISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const range = (a, b) => (a === b ? fmt(a) : fmt(a) + ' → ' + fmt(b));
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const overlaps = (a1, a2, b1, b2) => a1 <= b2 && b1 <= a2;
const roomOf = id => state.rooms.find(r => r.id === id);
const roomName = id => (roomOf(id) || {}).name || id;
const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'there';
function timeAgo(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return mins + ' minutes ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return plural(hrs, 'hour') + ' ago';
  const days = Math.round(hrs / 24);
  return plural(days, 'day') + ' ago';
}

/* where a booking is in its life (worked out from today's date, so rooms free up by themselves) */
function phase(b) {
  const t = state.today;
  if (b.status === 'pending') return b.checkOut < t ? 'expired' : 'pending';
  if (b.status === 'confirmed') return b.checkOut < t ? 'completed' : (b.checkIn <= t ? 'staying' : 'upcoming');
  return b.status; // declined, cancelled
}
const PHASE_LABEL = { pending: 'Waiting for you', expired: 'Expired', upcoming: 'Confirmed', staying: 'Staying now', completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled' };
const PHASE_CLASS = { pending: 'pill-pending', expired: 'pill-muted', upcoming: 'pill-free', staying: 'pill-occupied', completed: 'pill-muted', declined: 'pill-blocked', cancelled: 'pill-muted' };
const pill = (cls, text) => h('span', { class: 'status-pill ' + cls, text });

/* a waiting request whose dates are already taken by something else */
function clashFor(b) {
  const room = roomOf(b.roomId) || { closed: [] };
  for (const o of state.bookings) {
    if (o.id !== b.id && o.roomId === b.roomId && o.status === 'confirmed' && overlaps(b.checkIn, b.checkOut, o.checkIn, o.checkOut)) return o.name + "'s confirmed booking (" + range(o.checkIn, o.checkOut) + ')';
  }
  for (const k of state.blocks) {
    if (k.roomId === b.roomId && overlaps(b.checkIn, b.checkOut, k.from, k.to)) return 'dates you blocked (' + range(k.from, k.to) + (k.reason ? ', ' + k.reason : '') + ')';
  }
  for (const c of room.closed || []) if (overlaps(b.checkIn, b.checkOut, c[0], c[1])) return 'a period this room is closed (' + range(c[0], c[1]) + ')';
  return null;
}

/* ---------------- phone / whatsapp / email helpers ---------------- */
function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d;
}
function guestMessage(b) {
  const room = roomName(b.roomId), when = fmtFull(b.checkIn) + ' to ' + fmtFull(b.checkOut);
  if (b.status === 'confirmed') return 'Hello ' + firstName(b.name) + ', your stay at Mar Me Yullong Farmstay is confirmed!\n\nRoom: ' + room + '\nDates: ' + when + '\n\nCheck-in is from 1 pm. We look forward to welcoming you. Please message us if you need anything.';
  if (b.status === 'declined') return 'Hello ' + firstName(b.name) + ', thank you for your request for ' + room + ' (' + when + '). Unfortunately those dates are not available. Please let us know if other dates would suit you.';
  return 'Hello ' + firstName(b.name) + ', thank you for your booking request at Mar Me Yullong Farmstay for ' + room + ' (' + when + '). We will get back to you shortly.';
}
const waLink = b => 'https://wa.me/' + waNumber(b.phone) + '?text=' + encodeURIComponent(guestMessage(b));
const mailLink = b => 'mailto:' + b.email + '?subject=' + encodeURIComponent('Your stay at Mar Me Yullong Farmstay') + '&body=' + encodeURIComponent(guestMessage(b));
const openUrl = url => window.open(url, '_blank', 'noopener');

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg, isError) {
  const t = $('toast');
  t.textContent = msg; t.classList.toggle('error', !!isError); t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 6000 : 4200);
}

/* ---------------- pop-up dialog ---------------- */
const dlg = $('dlg');
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
function setDlgError(msg) { const e = $('dlg-error'); e.textContent = msg || ''; e.hidden = !msg; }
function openDialog({ title, body, actions }) {
  $('dlg-title').textContent = title;
  const bodyEl = $('dlg-body'); bodyEl.textContent = ''; bodyEl.append(...[].concat(body || []));
  setDlgError('');
  const act = $('dlg-actions'); act.textContent = '';
  actions.forEach(a => {
    const btn = h('button', { type: 'button', class: 'btn ' + (a.kind || 'btn-ghost'), text: a.label });
    btn.addEventListener('click', async () => {
      if (!a.onClick) { dlg.close(); return; }
      if (a.keepOpen) { a.onClick(); return; }
      btn.disabled = true; setDlgError('');
      try { const keep = await a.onClick(); if (keep !== false) dlg.close(); }
      catch (e) { setDlgError(e.message || 'Something went wrong.'); }
      finally { btn.disabled = false; }
    });
    act.append(btn);
  });
  if (!dlg.open) dlg.showModal();
}
const afterDialogCloses = fn => dlg.addEventListener('close', fn, { once: true });
const p = (...kids) => h('p', null, ...kids);

/* ---------------- login / app switching ---------------- */
function showLogin(message) {
  $('app-view').hidden = true; $('login-view').hidden = false;
  if (dlg.open) dlg.close();
  const err = $('login-error'); err.textContent = message || ''; err.hidden = !message;
  $('password').value = '';
}
function showApp() { $('login-view').hidden = true; $('app-view').hidden = false; }

$('pw-toggle').addEventListener('click', () => {
  const inp = $('password'), show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  $('pw-toggle').textContent = show ? 'Hide' : 'Show';
});
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('login-btn'), err = $('login-error');
  if (!$('password').value) { err.textContent = 'Please type your password.'; err.hidden = false; return; }
  btn.disabled = true; err.hidden = true;
  try {
    await api('/login', 'POST', { password: $('password').value });
    $('password').value = '';
    showApp(); await refresh();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  finally { btn.disabled = false; }
});
$('logout-btn').addEventListener('click', async () => {
  try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); } catch (_) { /* ignore */ }
  showLogin('You have been logged out.');
});

/* ---------------- loading data ---------------- */
async function refresh(silent) {
  try {
    const data = await api('/data');
    const sig = JSON.stringify([data.today, data.rooms, data.bookings, data.blocks, data.reviews, data.messages, data.subscribers]);
    const changed = sig !== state.sig;
    Object.assign(state, { today: data.today, rooms: data.rooms, bookings: data.bookings, blocks: data.blocks, reviews: data.reviews || [], messages: data.messages || [], subscribers: data.subscribers || [], sig });
    if (!state.calRoom || !roomOf(state.calRoom)) state.calRoom = state.rooms[0] ? state.rooms[0].id : null;
    if (!state.calY) { const t = parseISO(state.today); state.calY = t.getFullYear(); state.calM = t.getMonth(); }
    if (changed || !silent) {
      const a = document.activeElement;
      const typing = a && a.closest && a.closest('#content') && /INPUT|TEXTAREA|SELECT/.test(a.tagName);
      if (silent && typing) renderPending = true; else render();
    }
  } catch (e) {
    if (!silent && e.status !== 401) toast(e.message, true);
  }
}
setInterval(() => { if (!document.hidden && !dlg.open && !$('app-view').hidden) refresh(true); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('app-view').hidden) refresh(true); });

/* ---------------- tabs ---------------- */
function setTab(name) {
  state.tab = name;
  document.querySelectorAll('.tab').forEach(t => { const on = t.dataset.tab === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); });
  document.querySelectorAll('.tab-panel').forEach(s => { s.hidden = s.id !== 'tab-' + name; });
  render();
  window.scrollTo({ top: 0 });
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));

function render() {
  renderPending = false;
  const waiting = state.bookings.filter(b => phase(b) === 'pending').length;
  const badge = $('badge-requests'); badge.textContent = waiting; badge.hidden = waiting === 0;
  const inbox = inboxCount(), ib = $('badge-inbox'); ib.textContent = inbox; ib.hidden = inbox === 0;
  document.title = (waiting ? '(' + waiting + ') ' : '') + 'Owner Panel | Mar Me Yullong Farmstay';
  if (state.tab === 'overview') renderOverview();
  if (state.tab === 'requests') renderRequests();
  if (state.tab === 'bookings') renderBookings();
  if (state.tab === 'calendar') renderCalendar();
  if (state.tab === 'inbox') renderInbox();
}

/* ============================================================
   OVERVIEW
   ============================================================ */
// the first day a room is free again, following back-to-back bookings and blocks
function freeFrom(roomId, date) {
  let d = date;
  for (let i = 0; i < 400; i++) {
    const b = state.bookings.find(x => x.roomId === roomId && x.status === 'confirmed' && x.checkIn <= d && d <= x.checkOut);
    const k = state.blocks.find(x => x.roomId === roomId && x.from <= d && d <= x.to);
    const end = b ? b.checkOut : (k ? k.to : null);
    if (!end) return d;
    d = addDays(end, 1);
  }
  return d;
}
function roomStatus(room) {
  const t = state.today;
  const cur = state.bookings.find(b => b.roomId === room.id && b.status === 'confirmed' && b.checkIn <= t && t <= b.checkOut);
  const blk = state.blocks.find(k => k.roomId === room.id && k.from <= t && t <= k.to);
  const closed = (room.closed || []).find(c => c[0] <= t && t <= c[1]);
  if (cur) return { kind: 'occupied', label: 'Occupied', line: [h('strong', { text: cur.name }), ' is staying until ', h('strong', { text: fmt(cur.checkOut) })], sub: 'Free again from ' + fmt(freeFrom(room.id, t)) };
  if (blk || closed) { const end = blk ? blk.to : closed[1]; return { kind: 'blocked', label: 'Blocked', line: [(blk && blk.reason) ? blk.reason + '. ' : 'Not available. ', 'Until ', h('strong', { text: fmt(end) })], sub: 'Free again from ' + fmt(freeFrom(room.id, t)) }; }
  const upcoming = [
    ...state.bookings.filter(b => b.roomId === room.id && b.status === 'confirmed' && b.checkIn > t).map(b => ({ from: b.checkIn, to: b.checkOut, who: b.name })),
    ...state.blocks.filter(k => k.roomId === room.id && k.from > t).map(k => ({ from: k.from, to: k.to, who: k.reason || 'Blocked' })),
  ].sort((a, b) => (a.from < b.from ? -1 : 1))[0];
  return { kind: 'free', label: 'Available today', line: [upcoming ? ['Next: ', h('strong', { text: range(upcoming.from, upcoming.to) }), ' (' + upcoming.who + ')'] : 'No upcoming bookings.'], sub: '' };
}

function renderOverview() {
  const root = $('tab-overview'); root.textContent = '';
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const t = state.today;
  const waiting = state.bookings.filter(b => phase(b) === 'pending');
  const staying = state.bookings.filter(b => phase(b) === 'staying');
  const arriving = state.bookings.filter(b => phase(b) === 'upcoming' && b.checkIn <= addDays(t, 7));
  const statuses = state.rooms.map(r => ({ room: r, st: roomStatus(r) }));
  const freeCount = statuses.filter(x => x.st.kind === 'free').length;

  root.append(
    h('h1', { class: 'page-title' }, greet, '. Here is ', h('em', { text: 'today' }), '.'),
    h('p', { class: 'page-sub', text: parseISO(t).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }),
    h('div', { class: 'stats' },
      h('button', { type: 'button', class: 'stat' + (waiting.length ? ' attention' : ''), onclick: () => setTab('requests') }, h('div', { class: 'stat-num', text: waiting.length }), h('div', { class: 'stat-label', text: 'New requests' })),
      h('button', { type: 'button', class: 'stat', onclick: () => { state.filter = 'upcoming'; setTab('bookings'); } }, h('div', { class: 'stat-num', text: staying.length }), h('div', { class: 'stat-label', text: 'Staying now' })),
      h('button', { type: 'button', class: 'stat', onclick: () => { state.filter = 'upcoming'; setTab('bookings'); } }, h('div', { class: 'stat-num', text: arriving.length }), h('div', { class: 'stat-label', text: 'Arriving in 7 days' })),
      h('button', { type: 'button', class: 'stat', onclick: () => setTab('calendar') }, h('div', { class: 'stat-num', text: freeCount + '/' + state.rooms.length }), h('div', { class: 'stat-label', text: 'Rooms free today' })),
    ),
  );

  root.append(h('div', { class: 'section-label', text: 'Your rooms right now' }));
  const grid = h('div', { class: 'room-grid' });
  statuses.forEach(({ room, st }) => {
    grid.append(h('div', { class: 'room-card' },
      h('h3', { text: room.name }),
      pill(st.kind === 'free' ? 'pill-free' : st.kind === 'occupied' ? 'pill-occupied' : 'pill-blocked', st.label),
      h('p', { class: 'room-detail' }, st.line, st.sub ? [h('br'), st.sub] : null),
    ));
  });
  root.append(grid);

  if (waiting.length) {
    root.append(h('div', { class: 'section-label', text: 'Waiting for your answer' }));
    const list = h('div', { class: 'list' });
    waiting.slice(0, 3).forEach(b => list.append(bookingCard(b)));
    root.append(list);
    if (waiting.length > 3) root.append(h('p', { class: 'page-sub' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => setTab('requests'), text: 'See all ' + waiting.length + ' requests' })));
  }

  const soon = state.bookings.filter(b => phase(b) === 'upcoming').sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1)).slice(0, 5);
  if (staying.length || soon.length) {
    root.append(h('div', { class: 'section-label', text: 'Guests' }));
    const list = h('div', { class: 'list' });
    [...staying, ...soon].forEach(b => list.append(h('div', { class: 'block-row' },
      h('div', null, h('b', { text: b.name }), h('span', { text: roomName(b.roomId) + ' · ' + range(b.checkIn, b.checkOut) })),
      pill(PHASE_CLASS[phase(b)], PHASE_LABEL[phase(b)]),
    )));
    root.append(list);
  }
}

/* ============================================================
   BOOKING CARD (used in several places)
   ============================================================ */
function bookingCard(b) {
  const ph = phase(b);
  const n = b.nights != null ? b.nights : nightsBetween(b.checkIn, b.checkOut);
  const clash = ph === 'pending' ? clashFor(b) : null;
  const card = h('article', { class: 'bcard' + (ph === 'pending' ? ' is-new' : '') });

  card.append(h('div', { class: 'bcard-head' },
    h('div', null,
      h('div', { class: 'bname', text: b.name }),
      h('div', { class: 'bmeta', text: b.ref + ' · ' + (b.source === 'owner' ? 'Added by you' : 'Received ' + timeAgo(b.createdAt)) }),
    ),
    pill(PHASE_CLASS[ph], PHASE_LABEL[ph]),
  ));
  card.append(h('div', { class: 'bdates' }, roomName(b.roomId) + ' · ' + range(b.checkIn, b.checkOut), ' ', h('small', { text: '· ' + plural(n, 'night') })));

  const grid = h('div', { class: 'bgrid' });
  const item = (label, content) => grid.append(h('div', null, h('b', { text: label }), content));
  if (b.guests) item('Guests', String(b.guests));
  if (b.phone) item('Phone', h('a', { href: 'tel:' + b.phone.replace(/[^\d+]/g, ''), text: b.phone })); else item('Phone', 'Not given');
  if (b.email) item('Email', h('a', { href: 'mailto:' + b.email, text: b.email }));
  if (b.occasion) item('Occasion', b.occasion);
  if (b.timeSlot) item('Arrival time', b.timeSlot);
  card.append(grid);
  if (b.requests) card.append(h('div', { class: 'bnote' }, h('b', { text: 'Guest note: ' }), b.requests));
  if (b.note) card.append(h('div', { class: 'bnote' }, h('b', { text: 'Your note: ' }), b.note));
  if (clash) card.append(h('div', { class: 'bwarn', text: 'These dates clash with ' + clash + '. You cannot confirm this request unless that is cancelled first.' }));

  const actions = h('div', { class: 'bactions' });
  if (ph === 'pending') {
    actions.append(
      h('button', { type: 'button', class: 'btn btn-ok', disabled: !!clash, onclick: () => askConfirm(b), text: '✔ Confirm booking' }),
      h('button', { type: 'button', class: 'btn btn-danger', onclick: () => askDecline(b), text: '✖ Decline' }),
    );
  } else if (ph === 'upcoming' || ph === 'staying') {
    actions.append(h('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: () => askCancel(b), text: 'Cancel this booking' }));
  } else {
    actions.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => askRemove(b), text: 'Remove from list' }));
  }
  if (b.phone) actions.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openUrl(waLink(b)), text: 'WhatsApp guest' }));
  if (b.email) actions.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openUrl(mailLink(b)), text: 'Email guest' }));
  card.append(actions);
  return card;
}

/* ============================================================
   ACTIONS: confirm / decline / cancel / remove
   ============================================================ */
function bookingSummary(b) {
  return [
    p(h('strong', { text: b.name }), ' · ', b.guests ? plural(b.guests, 'guest') : 'guests not given'),
    p(h('strong', { text: roomName(b.roomId) }), h('br'), fmtFull(b.checkIn) + '  →  ' + fmtFull(b.checkOut) + '  (' + plural(nightsBetween(b.checkIn, b.checkOut), 'night') + ')'),
  ];
}

function askConfirm(b) {
  openDialog({
    title: 'Confirm this booking?',
    body: [
      ...bookingSummary(b),
      p('The room will be marked ', h('strong', { text: 'unavailable' }), ' on your website for these dates, so nobody else can book it. It opens up again by itself after ', h('strong', { text: fmtFull(b.checkOut) }), '.'),
    ],
    actions: [
      { label: 'Go back' },
      { label: '✔ Yes, confirm', kind: 'btn-gold', onClick: async () => {
        const r = await api('/bookings/' + b.id + '/confirm', 'POST');
        await refresh();
        afterDialogCloses(() => confirmedDialog(r.booking));
      } },
    ],
  });
}
function confirmedDialog(b) {
  const actions = [];
  if (b.phone) actions.push({ label: 'WhatsApp the guest', kind: 'btn-ok', keepOpen: true, onClick: () => openUrl(waLink(b)) });
  if (b.email) actions.push({ label: 'Email the guest', keepOpen: true, onClick: () => openUrl(mailLink(b)) });
  actions.push({ label: 'Done', kind: 'btn-gold' });
  openDialog({
    title: 'Booking confirmed ✔',
    body: [
      p(h('strong', { text: roomName(b.roomId) }), ' is now unavailable for ', h('strong', { text: range(b.checkIn, b.checkOut) }), '.'),
      p('The guest is not told automatically. Tap a button below to send them a ready-made message.'),
    ],
    actions,
  });
}

function askDecline(b) {
  const note = h('textarea', { placeholder: 'For example: fully booked, or the dates are not possible' });
  openDialog({
    title: 'Decline this request?',
    body: [
      ...bookingSummary(b),
      p('The dates stay free for other guests. The guest is not told automatically, so you can message them afterwards.'),
      h('div', { class: 'field' }, h('label', { text: 'Reason (optional, only you can see this)' }), note),
    ],
    actions: [
      { label: 'Go back' },
      { label: 'Decline request', kind: 'btn-danger', onClick: async () => { await api('/bookings/' + b.id + '/decline', 'POST', { note: note.value }); await refresh(); toast('Request declined.'); } },
    ],
  });
}

function askCancel(b) {
  const note = h('textarea', { placeholder: 'Why is it being cancelled? (optional)' });
  openDialog({
    title: 'Cancel this booking?',
    body: [
      ...bookingSummary(b),
      p(h('strong', { text: roomName(b.roomId) }), ' will become ', h('strong', { text: 'available again' }), ' to guests for these dates straight away.'),
      h('div', { class: 'field' }, h('label', { text: 'Note (optional, only you can see this)' }), note),
    ],
    actions: [
      { label: 'Keep booking' },
      { label: 'Yes, cancel it', kind: 'btn-danger', onClick: async () => { await api('/bookings/' + b.id + '/cancel', 'POST', { note: note.value }); await refresh(); toast('Booking cancelled. The room is open again for these dates.'); } },
    ],
  });
}

function askRemove(b) {
  openDialog({
    title: 'Remove from the list?',
    body: [...bookingSummary(b), p('This only tidies up your list. It cannot be undone.')],
    actions: [
      { label: 'Go back' },
      { label: 'Remove', kind: 'btn-danger', onClick: async () => { await api('/bookings/' + b.id, 'DELETE'); await refresh(); toast('Removed.'); } },
    ],
  });
}

/* ============================================================
   NEW REQUESTS TAB
   ============================================================ */
function renderRequests() {
  const root = $('tab-requests'); root.textContent = '';
  const waiting = state.bookings.filter(b => phase(b) === 'pending').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  root.append(
    h('h1', { class: 'page-title' }, 'New ', h('em', { text: 'requests' })),
    h('p', { class: 'page-sub', text: 'Guests who asked to book through your website. Confirm a request to make the room unavailable for those dates.' }),
  );
  if (!waiting.length) {
    root.append(h('div', { class: 'empty' }, h('strong', { text: 'Nothing waiting' }), 'You are all caught up. New requests will appear here.'));
    return;
  }
  const list = h('div', { class: 'list' });
  waiting.forEach(b => list.append(bookingCard(b)));
  root.append(list);
}

/* ============================================================
   MESSAGES & REVIEWS TAB
   - guest reviews (live on the website straight away) can be deleted here
   - contact-form messages and newsletter sign-ups
   ============================================================ */
const inboxCount = () => state.messages.filter(m => !m.done).length;
const starText = n => '\u2605'.repeat(n) + '\u2606'.repeat(5 - n);

function reviewCard(r) {
  const card = h('article', { class: 'bcard' });
  card.append(
    h('div', { class: 'bcard-head' },
      h('div', null, h('div', { class: 'bname', text: r.name }), h('div', { class: 'bmeta', text: starText(r.stars) + ' \u00b7 ' + timeAgo(r.createdAt) })),
      pill('pill-free', 'On website')),
    h('div', { class: 'bnote', text: r.text }),
  );
  card.append(h('div', { class: 'bactions' },
    h('button', { type: 'button', class: 'btn btn-danger btn-sm', text: 'Delete review', onclick: () => openDialog({
      title: 'Delete this review?',
      body: [p(h('strong', { text: r.name }), ' \u00b7 ', starText(r.stars)), p(r.text), p('It is removed from your website for good and cannot be undone.')],
      actions: [{ label: 'Go back' }, { label: 'Delete', kind: 'btn-danger', onClick: async () => { await api('/reviews/' + r.id, 'DELETE'); await refresh(); toast('Review deleted.'); } }],
    }) }),
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Email ' + firstName(r.name), onclick: () => openUrl('mailto:' + r.email) }),
  ));
  return card;
}

function messageCard(m) {
  const card = h('article', { class: 'bcard' + (m.done ? '' : ' is-new') });
  const grid = h('div', { class: 'bgrid' });
  grid.append(h('div', null, h('b', { text: 'Email' }), h('a', { href: 'mailto:' + m.email, text: m.email })));
  if (m.phone) grid.append(h('div', null, h('b', { text: 'Phone' }), h('a', { href: 'tel:' + m.phone.replace(/[^\d+]/g, ''), text: m.phone })));
  card.append(
    h('div', { class: 'bcard-head' },
      h('div', null, h('div', { class: 'bname', text: m.subject }), h('div', { class: 'bmeta', text: m.name + ' \u00b7 Received ' + timeAgo(m.createdAt) })),
      pill(m.done ? 'pill-muted' : 'pill-pending', m.done ? 'Dealt with' : 'New')),
    grid,
    h('div', { class: 'bnote', text: m.message }),
  );
  const actions = h('div', { class: 'bactions' });
  actions.append(
    h('button', { type: 'button', class: m.done ? 'btn btn-ghost btn-sm' : 'btn btn-ok', text: m.done ? 'Mark as new' : '\u2714 Mark as dealt with', onclick: async () => {
      try { await api('/messages/' + m.id + '/done', 'POST', { done: !m.done }); await refresh(); } catch (e) { toast(e.message, true); }
    } }),
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Reply by email', onclick: () => openUrl('mailto:' + m.email + '?subject=' + encodeURIComponent('Re: ' + m.subject)) }),
  );
  if (m.phone) actions.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'WhatsApp', onclick: () => openUrl('https://wa.me/' + waNumber(m.phone)) }));
  actions.append(h('button', { type: 'button', class: 'btn btn-danger btn-sm', text: 'Delete', onclick: () => openDialog({
    title: 'Delete this message?',
    body: [p(h('strong', { text: m.subject }), ' from ', m.name), p('It is removed for good and cannot be undone.')],
    actions: [{ label: 'Go back' }, { label: 'Delete', kind: 'btn-danger', onClick: async () => { await api('/messages/' + m.id, 'DELETE'); await refresh(); toast('Message deleted.'); } }],
  }) }));
  card.append(actions);
  return card;
}

function renderInbox() {
  const root = $('tab-inbox'); root.textContent = '';
  const newMsgs = state.messages.filter(m => !m.done);
  const doneMsgs = state.messages.filter(m => m.done);

  root.append(
    h('h1', { class: 'page-title' }, 'Messages & ', h('em', { text: 'reviews' })),
    h('p', { class: 'page-sub', text: 'Guest reviews appear on your website as soon as they are sent. Delete any you do not want shown. Messages come from the Contact page.' }),
  );

  const section = (title, count, items, emptyText) => {
    root.append(h('h2', { class: 'page-title inbox-h', text: title + (count ? ' (' + count + ')' : '') }));
    if (!items.length) { root.append(h('div', { class: 'empty' }, emptyText)); return; }
    const list = h('div', { class: 'list' }); items.forEach(i => list.append(i)); root.append(list);
  };
  section('New messages', newMsgs.length, newMsgs.map(messageCard), 'No new messages.');
  section('Reviews on your website', state.reviews.length, state.reviews.map(reviewCard), 'No guest reviews yet.');
  if (doneMsgs.length) section('Messages already dealt with', doneMsgs.length, doneMsgs.map(messageCard), '');

  // newsletter sign-ups
  root.append(h('h2', { class: 'page-title inbox-h', text: 'Newsletter sign-ups' + (state.subscribers.length ? ' (' + state.subscribers.length + ')' : '') }));
  if (!state.subscribers.length) { root.append(h('div', { class: 'empty' }, 'Nobody has signed up yet.')); return; }
  const box = h('div', { class: 'bcard' });
  box.append(h('div', { class: 'bactions inbox-bar' },
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Copy all email addresses', onclick: async () => {
      try { await navigator.clipboard.writeText(state.subscribers.map(x => x.email).join(', ')); toast('Copied. Paste them into the "Bcc" box of a new email.'); }
      catch (_) { toast('Could not copy. Please select the addresses below and copy them.', true); }
    } })));
  const ul = h('div', { class: 'bgrid sub-grid' });
  state.subscribers.forEach(x => ul.append(h('div', { class: 'sub-row' },
    h('span', null, x.email, ' ', h('small', { text: '\u00b7 ' + timeAgo(x.createdAt) })),
    h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Remove', onclick: () => openDialog({
      title: 'Remove this address?',
      body: [p(x.email), p('They will no longer be on your list.')],
      actions: [{ label: 'Go back' }, { label: 'Remove', kind: 'btn-danger', onClick: async () => { await api('/subscribers/' + x.id, 'DELETE'); await refresh(); toast('Removed.'); } }],
    }) }))));
  box.append(ul); root.append(box);
}

/* ============================================================
   BOOKINGS TAB
   ============================================================ */
const FILTERS = [
  ['upcoming', 'Upcoming & staying'],
  ['past', 'Past'],
  ['closed', 'Declined & cancelled'],
  ['all', 'Everything'],
];
function matchesFilter(b) {
  const ph = phase(b);
  if (state.filter === 'upcoming') return ph === 'upcoming' || ph === 'staying';
  if (state.filter === 'past') return ph === 'completed';
  if (state.filter === 'closed') return ph === 'declined' || ph === 'cancelled' || ph === 'expired';
  return true;
}
function renderBookings() {
  const root = $('tab-bookings'); root.textContent = '';
  root.append(
    h('h1', { class: 'page-title' }, 'All ', h('em', { text: 'bookings' })),
    h('p', { class: 'page-sub', text: 'Rooms open up again by themselves once the last day of a stay has passed.' }),
  );
  const filters = h('div', { class: 'filters' });
  FILTERS.forEach(([key, label]) => filters.append(h('button', { type: 'button', class: 'chip' + (state.filter === key ? ' active' : ''), text: label, onclick: () => { state.filter = key; renderBookings(); } })));
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search by name, phone or booking number', value: state.search, 'aria-label': 'Search bookings' });
  filters.append(search);
  root.append(filters);
  const listBox = h('div', { class: 'list' });
  root.append(listBox);
  const draw = () => {
    listBox.textContent = '';
    const q = state.search.trim().toLowerCase();
    let items = state.bookings.filter(matchesFilter);
    if (q) items = items.filter(b => [b.name, b.phone, b.email, b.ref, roomName(b.roomId)].join(' ').toLowerCase().includes(q));
    if (state.filter === 'upcoming') items.sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));
    else if (state.filter === 'past') items.sort((a, b) => (a.checkOut < b.checkOut ? 1 : -1));
    if (!items.length) { listBox.append(h('div', { class: 'empty' }, h('strong', { text: q ? 'No matches' : 'Nothing here yet' }), q ? 'Try a different name or number.' : 'Bookings will show up here.')); return; }
    items.forEach(b => listBox.append(bookingCard(b)));
  };
  search.addEventListener('input', () => { state.search = search.value; draw(); });
  draw();
}

/* ============================================================
   CALENDAR TAB
   ============================================================ */
function dayInfo(roomId, iso) {
  const b = state.bookings.find(x => x.roomId === roomId && x.status === 'confirmed' && x.checkIn <= iso && iso <= x.checkOut);
  if (b) return { kind: 'booked', b };
  const k = state.blocks.find(x => x.roomId === roomId && x.from <= iso && iso <= x.to);
  if (k) return { kind: 'blocked', k };
  const room = roomOf(roomId);
  const c = ((room && room.closed) || []).find(x => x[0] <= iso && iso <= x[1]);
  if (c) return { kind: 'blocked', closed: c };
  return { kind: 'free' };
}
const pendingOn = (roomId, iso) => state.bookings.filter(x => x.roomId === roomId && phase(x) === 'pending' && x.checkIn <= iso && iso <= x.checkOut);

function renderCalendar() {
  const root = $('tab-calendar'); root.textContent = '';
  root.append(
    h('h1', { class: 'page-title' }, 'Room ', h('em', { text: 'calendar' })),
    h('p', { class: 'page-sub', text: 'Pick a room to see which days are taken. Tap any day for details.' }),
  );
  if (!state.rooms.length) return;

  const tabs = h('div', { class: 'filters' });
  state.rooms.forEach(r => tabs.append(h('button', { type: 'button', class: 'chip' + (state.calRoom === r.id ? ' active' : ''), text: r.name, onclick: () => { state.calRoom = r.id; state.calDay = null; renderCalendar(); } })));
  root.append(tabs);

  const first = new Date(state.calY, state.calM, 1);
  const days = new Date(state.calY, state.calM + 1, 0).getDate();
  const grid = h('div', { class: 'cal-grid' });
  for (let i = 0; i < first.getDay(); i++) grid.append(h('span', { class: 'cal-blank' }));
  for (let d = 1; d <= days; d++) {
    const iso = state.calY + '-' + pad(state.calM + 1) + '-' + pad(d);
    const info = dayInfo(state.calRoom, iso);
    const pend = pendingOn(state.calRoom, iso).length > 0 && info.kind === 'free';
    const cls = 'cal-day ' + (info.kind === 'booked' ? 'booked ' : info.kind === 'blocked' ? 'blocked ' : '') + (pend ? 'pending ' : '') + (iso < state.today ? 'past ' : '') + (iso === state.today ? 'today ' : '') + (state.calDay === iso ? 'selected' : '');
    grid.append(h('button', { type: 'button', class: cls.trim(), text: d, 'aria-label': fmtFull(iso), onclick: () => { state.calDay = iso; renderCalendar(); } }));
  }
  const monthLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const move = n => { state.calM += n; if (state.calM < 0) { state.calM = 11; state.calY--; } if (state.calM > 11) { state.calM = 0; state.calY++; } state.calDay = null; renderCalendar(); };
  root.append(h('div', { class: 'cal-wrap' },
    h('div', { class: 'cal-head' },
      h('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Previous month', text: '‹', onclick: () => move(-1) }),
      h('div', { class: 'cal-title', text: monthLabel }),
      h('button', { type: 'button', class: 'cal-nav', 'aria-label': 'Next month', text: '›', onclick: () => move(1) }),
    ),
    h('div', { class: 'cal-dow', 'aria-hidden': 'true' }, ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(x => h('span', { text: x }))),
    grid,
    h('div', { class: 'legend' },
      h('span', null, h('i'), 'Free'), h('span', null, h('i', { class: 'l-booked' }), 'Booked'),
      h('span', null, h('i', { class: 'l-blocked' }), 'Blocked'), h('span', null, h('i', { class: 'l-pending' }), 'Request waiting'),
    ),
  ));

  if (state.calDay) {
    const iso = state.calDay, info = dayInfo(state.calRoom, iso), pend = pendingOn(state.calRoom, iso);
    const box = h('div', { class: 'day-detail' }, h('strong', { text: fmtFull(iso) }), h('br'));
    if (info.kind === 'booked') {
      box.append(info.b.name + ' is booked here (' + range(info.b.checkIn, info.b.checkOut) + ').');
      box.append(h('div', { class: 'bactions' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Open this booking', onclick: () => { state.filter = 'all'; state.search = info.b.ref; setTab('bookings'); } })));
    } else if (info.kind === 'blocked') {
      box.append(info.k ? 'Blocked by you (' + range(info.k.from, info.k.to) + (info.k.reason ? ', ' + info.k.reason : '') + ').' : 'This room is closed on this day.');
    } else {
      box.append(iso < state.today ? 'This day has passed.' : 'Free: guests can book this day.');
    }
    if (pend.length) box.append(h('br'), pend.length + ' request' + (pend.length === 1 ? ' is' : 's are') + ' waiting for dates that include this day.');
    root.append(box);
  }

  const blocks = state.blocks.filter(k => k.roomId === state.calRoom && k.to >= state.today);
  root.append(h('div', { class: 'section-label', text: 'Dates you blocked for ' + roomName(state.calRoom) }));
  if (!blocks.length) root.append(h('p', { class: 'page-sub', text: 'Nothing blocked. Use “Block dates” at the top if you need to close the room (repairs, family stay, off-season).' }));
  else {
    const list = h('div', { class: 'list' });
    blocks.forEach(k => list.append(h('div', { class: 'block-row' },
      h('div', null, h('b', { text: range(k.from, k.to) }), h('span', { text: k.reason || 'No reason given' })),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Unblock', onclick: () => askUnblock(k) }),
    )));
    root.append(list);
  }
}
function askUnblock(k) {
  openDialog({
    title: 'Open these dates again?',
    body: [p(h('strong', { text: roomName(k.roomId) }), ' will be available to guests again from ', h('strong', { text: fmtFull(k.from) }), ' to ', h('strong', { text: fmtFull(k.to) }), '.')],
    actions: [{ label: 'Go back' }, { label: 'Yes, open them', kind: 'btn-gold', onClick: async () => { await api('/blocks/' + k.id, 'DELETE'); await refresh(); toast('Dates are open again.'); } }],
  });
}

/* ============================================================
   FORMS: add a booking, block dates
   ============================================================ */
const field = (label, input, hint) => h('div', { class: 'field' }, h('label', { text: label }), input, hint ? h('div', { class: 'hint', text: hint }) : null);
function roomSelect(selected, includeAll) {
  const s = h('select');
  if (includeAll) s.append(h('option', { value: 'all', text: 'All rooms' }));
  state.rooms.forEach(r => s.append(h('option', { value: r.id, text: r.name })));
  s.value = selected || (includeAll ? 'all' : (state.rooms[0] && state.rooms[0].id));
  return s;
}
// the end date follows the start date so the owner only changes what is needed
function linkDates(from, to) {
  from.min = state.today; to.min = state.today;
  from.addEventListener('change', () => { if (from.value) { to.min = from.value; if (!to.value || to.value < from.value) to.value = from.value; } });
}

function openAddBooking() {
  const name = h('input', { type: 'text', placeholder: "Guest's full name", autocomplete: 'off' });
  const phone = h('input', { type: 'tel', placeholder: 'e.g. 98765 43210', autocomplete: 'off' });
  const email = h('input', { type: 'email', placeholder: 'Optional', autocomplete: 'off' });
  const room = roomSelect(state.tab === 'calendar' ? state.calRoom : null, false);
  const from = h('input', { type: 'date' }), to = h('input', { type: 'date' });
  const guests = h('input', { type: 'number', min: '1', max: '20', placeholder: 'Optional' });
  const note = h('textarea', { placeholder: 'Anything you want to remember (optional)' });
  linkDates(from, to);
  openDialog({
    title: 'Add a booking',
    body: [
      p('For guests who booked by phone or in person. It is confirmed straight away and the room becomes unavailable on the website.'),
      field('Guest name', name), field('Phone number', phone), field('Email', email), field('Room', room),
      h('div', { class: 'field-row' }, field('First day (check-in)', from), field('Last day (check-out)', to)),
      h('div', { class: 'hint', text: 'Both the first and last day are marked as taken.' }),
      field('Number of guests', guests), field('Note', note),
    ],
    actions: [
      { label: 'Cancel' },
      { label: 'Save booking', kind: 'btn-gold', onClick: async () => {
        if (name.value.trim().length < 2) throw new Error("Please enter the guest's name.");
        if (phone.value.replace(/\D/g, '').length < 7) throw new Error("Please enter the guest's phone number.");
        if (!from.value || !to.value) throw new Error('Please choose both dates.');
        await api('/bookings', 'POST', { name: name.value, phone: phone.value, email: email.value, roomId: room.value, checkIn: from.value, checkOut: to.value, guests: guests.value, note: note.value });
        await refresh();
        toast('Booking saved. ' + roomName(room.value) + ' is now unavailable for those dates.');
      } },
    ],
  });
}

function openBlockDates() {
  const room = roomSelect(state.tab === 'calendar' ? state.calRoom : 'all', true);
  const from = h('input', { type: 'date' }), to = h('input', { type: 'date' });
  const reason = h('input', { type: 'text', placeholder: 'e.g. Repairs, family visiting, off-season', list: 'reasons', autocomplete: 'off' });
  const list = h('datalist', { id: 'reasons' }, ['Repairs / maintenance', 'Family or personal use', 'Walk-in guest', 'Off-season', 'Cleaning'].map(x => h('option', { value: x })));
  linkDates(from, to);
  openDialog({
    title: 'Block dates',
    body: [
      p('Close a room on your website so nobody can book it on these days. You can open the dates again at any time from the Calendar.'),
      field('Room', room),
      h('div', { class: 'field-row' }, field('First day', from), field('Last day', to)),
      h('div', { class: 'hint', text: 'Both the first and last day are blocked. For a single day, choose the same date twice.' }),
      field('Reason (optional)', reason), list,
    ],
    actions: [
      { label: 'Cancel' },
      { label: 'Block these dates', kind: 'btn-gold', onClick: async () => {
        if (!from.value || !to.value) throw new Error('Please choose both dates.');
        await api('/blocks', 'POST', { roomId: room.value, from: from.value, to: to.value, reason: reason.value });
        await refresh();
        toast((room.value === 'all' ? 'All rooms are' : roomName(room.value) + ' is') + ' now blocked for those dates.');
      } },
    ],
  });
}
$('add-booking-btn').addEventListener('click', openAddBooking);
$('block-btn').addEventListener('click', openBlockDates);

/* ---------------- start ---------------- */
(async function start() {
  try {
    const r = await fetch('/api/admin/me', { credentials: 'same-origin' });
    if (r.ok) { showApp(); await refresh(); } else showLogin();
  } catch (_) { showLogin(); }
})();
