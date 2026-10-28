# Mar Me Yullong Farmstay: website + owner panel

## What is in this folder
```
server.js            the small server (stores bookings, protects the owner panel)
package.json         lists what the server needs
.env.example         copy to ".env" and set your owner password
public/              the website (what visitors see)
  index.html, gallery.html, reviews.html, locations.html, bookings.html, contact.html
  style.css, script.js, sitemap.xml, robots.txt, Homestaylogo.png
  admin/             the OWNER PANEL (index.html, admin.css, admin.js)
data/                created automatically on first start (bookings, rooms). Back this up!
```

## Run it on your own computer
1. Install Node.js (version 18 or newer) from nodejs.org.
2. Open a terminal in this folder and run: `npm install`
3. Copy `.env.example` to a new file named `.env`, then open it and set `ADMIN_PASSWORD` (at least 8 characters, something only the owner knows).
4. Run: `npm start`
5. Website: http://localhost:3000   Owner panel: http://localhost:3000/admin/

## Putting it online
The website now needs a host that can run Node.js (for example Render, Railway, or a small VPS). Plain "static" hosting cannot store bookings.
- Upload the whole folder (not `node_modules`, not your `.env`) and set the same settings from `.env.example` as environment variables on the host.
- Make sure the host keeps the `data/` folder between restarts (a "persistent disk"/volume), otherwise bookings are lost.
- Once the site is on https://, set `COOKIE_SECURE=true`. If the host sits behind a proxy (most do), also set `TRUST_PROXY=true`.
- The owner panel lives at `yourdomain.com/admin/`. It is not linked anywhere on the website and is hidden from search engines.

## How bookings work
1. A guest sends a request from the website. It appears under **New requests** (it does NOT block the room yet).
2. The owner taps **Confirm booking**. From that moment the room shows those dates as unavailable on the website.
3. The first and last day of a booking are both marked as taken. After the last day has passed, the room is available again automatically. Nobody has to do anything.
4. **Cancel this booking** opens the dates up again straight away. **Decline** leaves the dates free.
5. **Add a booking** is for phone and walk-in guests. **Block dates** closes a room for repairs, family use or off-season.
The panel can open a ready-made WhatsApp or email message for the guest. The guest is not messaged automatically.

## Changing the rooms
The first time the server starts it creates `data/rooms.json` with three sample rooms. Edit that file to set your real room names, sizes and rules (minimum and maximum nights, how far ahead guests can book, closed dates). Keep each room's `id` the same once bookings exist. The website and the owner panel both read this file, so there is only one place to edit. The `ROOMS` list at the top of `public/script.js` is only used when previewing the site without the server.

## Backups
Everything lives in `data/db.json` (a copy of the previous version is kept as `db.backup.json`). Copy the `data/` folder somewhere safe regularly.

## Not included yet
The contact form, reviews form, newsletter box and chat answer politely that they are "not set up yet". Email or SMS alerts for new requests are not included either; the owner sees new requests in the panel (the page refreshes itself every 30 seconds).
