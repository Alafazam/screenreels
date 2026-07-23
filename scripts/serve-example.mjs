import http from 'http';
import fs from 'fs';
import path from 'path';
const root = path.resolve(new URL('..', import.meta.url).pathname); const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
http.createServer((req, res) => { const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname); const requested = pathname === '/' ? '/examples/action-showcase/index.html' : pathname; let file = path.resolve(root, `.${requested}`); if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); } res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res); }).listen(port, () => console.log(`ScreenReel examples: http://127.0.0.1:${port}/examples/action-showcase/`));
