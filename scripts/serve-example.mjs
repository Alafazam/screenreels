import http from 'http';
import fs from 'fs';
import path from 'path';
const root = path.resolve(new URL('..', import.meta.url).pathname); const port = Number(process.env.PORT || 4173);
/* The landing loads its CSS and scripts by relative path, so it must be served from its own
   directory: `/` redirects there rather than serving the HTML at a path its assets cannot resolve from. */
const LANDING_PATH = '/examples/action-showcase/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
http.createServer((req, res) => { const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname); if (pathname === '/') { res.writeHead(302, { location: LANDING_PATH }); return res.end(); } const requested = pathname; let file = path.resolve(root, `.${requested}`); if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); } res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream'); res.setHeader('cache-control', 'no-store'); fs.createReadStream(file).pipe(res); }).listen(port, () => console.log(`ScreenReel examples: http://127.0.0.1:${port}/examples/action-showcase/`));
