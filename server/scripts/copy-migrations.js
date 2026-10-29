// Copies SQL migrations next to the compiled code: src/db/migrations -> dist/db/migrations
const fs = require('node:fs');
const path = require('node:path');

const from = path.join(__dirname, '..', 'src', 'db', 'migrations');
const to = path.join(__dirname, '..', 'dist', 'db', 'migrations');
fs.mkdirSync(to, { recursive: true });
for (const f of fs.readdirSync(from)) {
  if (f.endsWith('.sql')) fs.copyFileSync(path.join(from, f), path.join(to, f));
}
