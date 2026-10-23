import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const webRoot = [path.join(projectRoot, 'web'), path.join(projectRoot, 'dist'), path.join(__dirname, 'web')]
  .find((candidate) => fs.existsSync(path.join(candidate, 'index.html')));
const port = Number(process.env.SOLIDGEO_PORT || 47821);

if (!webRoot) {
  console.error('SolidGeo: web/dist assets not found.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      pathname = url.pathname;
    }
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const target = path.resolve(webRoot, `.${pathname}`);
    const rootWithSep = `${path.resolve(webRoot)}${path.sep}`;
    if (!target.startsWith(rootWithSep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const data = fs.readFileSync(target);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.on('error', (error) => {
  console.error(`SolidGeo server failed: ${error.message}`);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Set SOLIDGEO_PORT to another port.`);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('');
  console.log('  SolidGeo 立体几何 · Web Edition');
  console.log('  ------------------------------------------');
  console.log(`  http://127.0.0.1:${port}/index.html?web=1`);
  console.log('');
  console.log('  Keep this window open while using SolidGeo.');
  console.log('  Close this window to stop the local server.');
  console.log('');
  if (process.env.SOLIDGEO_OPEN === '1') {
    const url = `http://127.0.0.1:${port}/index.html?web=1`;
    try {
      const child = spawn('cmd.exe', ['/c', 'start', '', url], {
        stdio: 'ignore',
        windowsHide: true,
        detached: true,
      });
      child.unref();
    } catch {
      console.log('  Please open 打开SolidGeo.url manually.');
    }
  }
});
