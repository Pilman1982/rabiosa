// Kleiner Server zum Ausprobieren auf dem eigenen Computer:  node werkzeug/server.mjs
// Danach im Browser öffnen:  http://localhost:8765/?demo=1
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || Number(process.argv[2]) || 8765;
const ARTEN = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

createServer(async (anfrage, antwort) => {
  let pfad = decodeURIComponent(new URL(anfrage.url, 'http://x').pathname);
  if (pfad.endsWith('/')) pfad += 'index.html';
  const datei = normalize(join(wurzel, pfad));
  if (!datei.startsWith(wurzel)) { antwort.writeHead(403).end(); return; }
  try {
    const inhalt = await readFile(datei);
    antwort.writeHead(200, { 'Content-Type': ARTEN[extname(datei)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(inhalt);
  } catch { antwort.writeHead(404, { 'Content-Type': 'text/plain' }).end('Nicht gefunden'); }
}).listen(port, () => console.log(`Rabiosa läuft auf http://localhost:${port}/?demo=1`));
