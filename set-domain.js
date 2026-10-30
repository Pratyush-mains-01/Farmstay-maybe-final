'use strict';
// Replaces the placeholder https://YOUR-DOMAIN.com in the page tags, sitemap and robots.txt with your real address.
// Usage:  npm run set-domain -- https://www.yourfarmstay.com
const fs = require('fs');
const path = require('path');
const target = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\/[^\s/]+\.[^\s/]+$/.test(target)) {
  console.error('\n  Please give your website address, for example:\n  npm run set-domain -- https://www.yourfarmstay.com\n');
  process.exit(1);
}
const dir = path.join(__dirname, 'public');
let files = 0, changes = 0;
for (const f of fs.readdirSync(dir)) {
  if (!/\.(html|xml|txt)$/.test(f)) continue;
  const file = path.join(dir, f);
  const text = fs.readFileSync(file, 'utf8');
  const parts = text.split('https://YOUR-DOMAIN.com');
  if (parts.length === 1) continue;
  fs.writeFileSync(file, parts.join(target));
  files++; changes += parts.length - 1;
}
console.log('\n  Done: ' + changes + ' places updated in ' + files + ' files. Commit and upload them.\n');
