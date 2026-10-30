# Mar Me Yullong Farmstay: website + owner panel

## What is in this folder
```
server.js            the server (bookings, reviews, messages, chat, email alerts, owner login)
package.json         lists what the server needs
set-domain.js        one-time helper that puts your real website address into the SEO tags
.env.example         copy to ".env" and fill in (never upload ".env")
public/              the website (what visitors see)
  index.html, gallery.html, reviews.html, locations.html, bookings.html, contact.html
  style.css, script.js, sitemap.xml, robots.txt, Homestaylogo.png
  admin/             the OWNER PANEL (index.html, admin.css, admin.js)
data/                created automatically on first start (bookings, reviews, messages). Back this up!
```
There is no `.github/workflows/static.yml` any more. GitHub Pages can only show static pages, and this site needs a server, so delete that file if it is still in your repo.

## Run it on your own computer
1. Install Node.js (version 18 or newer) from nodejs.org.
2. In this folder run: `npm install`
3. Copy `.env.example` to a new file named `.env` and set `ADMIN_PASSWORD` (at least 8 characters).
4. Run: `npm start`
5. Website: http://localhost:3000   Owner panel: http://localhost:3000/admin/

(The old `node index.js` no longer exists. Always start the site with `npm start`.)

## Settings (.env or the host's "environment variables")
| Name | What it does |
|---|---|
| `ADMIN_PASSWORD` | Owner panel password. Required, at least 8 characters. |
| `COOKIE_SECURE` | Set `true` once the site is on https. |
| `TRUST_PROXY` | Set `true` on Render, Railway and similar hosts. |
| `RESEND_API_KEY`, `ADMIN_EMAIL`, `MAIL_FROM` | Email alerts (see below). Leave the key empty to switch alerts off. |
| `DATA_DIR` | Where bookings are stored. Point it at a persistent disk on your host, e.g. `/var/data`. |

## Putting it online (Render)
1. Create a **Web Service** from your GitHub repo. Build command: `npm install`. Start command: `npm start`.
2. Under *Environment*, add the settings from the table above (`ADMIN_PASSWORD`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`, and the email ones). The `.env` file is not uploaded, so they must be typed in here.
3. **Storage:** Render's free plan wipes the disk on every restart and redeploy, which would delete all bookings, reviews and messages. Add a *Disk* (paid plans only), mount it at `/var/data`, and set `DATA_DIR=/var/data`. Until then, treat the emails and the owner panel as your record and copy `data/db.json` regularly.
4. Once you know your real web address, run `npm run set-domain -- https://www.yourfarmstay.com`, then commit and push. This fixes the canonical tags, sitemap and robots.txt (they say `YOUR-DOMAIN.com` until you do).

## How bookings work
1. A guest sends a request from the website. It appears under **New requests** (it does NOT block the room yet).
2. The owner taps **Confirm booking**. From then on the room shows those dates as unavailable on the website.
3. The first and last day of a booking are both marked as taken. After the last day has passed, the room is available again automatically.
4. **Cancel this booking** opens the dates up again straight away. **Decline** leaves the dates free.
5. **Add a booking** is for phone and walk-in guests. **Block dates** closes a room for repairs, family use or off-season.
The panel can open a ready-made WhatsApp or email message for the guest. The guest is not messaged automatically.

## Reviews, messages and newsletter
Open **Messages & reviews** in the owner panel.
- **Reviews** from guests go live on the website as soon as they are sent. They are listed here, and **Delete review** removes one for good. Only name, stars, text and month are public; the reviewer's email never is. You also get an email alert for each new review.
- **Messages** from the Contact page can be replied to by email or WhatsApp, marked as dealt with, or deleted.
- **Newsletter sign-ups** are listed with a button that copies every address (paste them into the Bcc box of an email).
The chat widget answers from the `FAQS` list near the top of `server.js`. Please read those answers and make sure each one is true for the farmstay (check-in time, breakfast, parking, cancellation...).

## Email alerts
When a booking request, review, message or sign-up arrives, the server emails `ADMIN_EMAIL` through Resend. Resend's free test sender (`onboarding@resend.dev`) can only deliver to the email address your Resend account was created with, and the free plan has sending limits. If alerts stop, open the host's logs and look for lines starting with `Email alert FAILED`: they show the exact reason Resend gave. To email other people, verify your own domain in Resend and set `MAIL_FROM`.

## Changing the rooms
The first time the server starts it creates `data/rooms.json` with three sample rooms. Edit that file to set your real room names, sizes and rules (minimum and maximum nights, how far ahead guests can book, closed dates). Keep each room's `id` the same once bookings exist. The `ROOMS` list at the top of `public/script.js` is only used when previewing the site without the server.

## Backups
Everything lives in `data/db.json` (a copy of the previous version is kept as `db.backup.json`). Copy the `data/` folder somewhere safe regularly. It is listed in `.gitignore` on purpose, so guest details never go to GitHub.
