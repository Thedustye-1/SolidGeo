import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const webRootCandidates = [
  path.join(projectRoot, 'web'),
  path.join(projectRoot, 'dist'),
  path.join(__dirname, 'web'),
];
const webRoot = webRootCandidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html')));
const localRoot = path.join(os.homedir(), 'AppData', 'Local', 'SolidGeo');
const logPath = path.join(localRoot, 'launcher.log');

function log(message) {
  try {
    fs.mkdirSync(localRoot, { recursive: true });
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
  } catch {
    /* ignore */
  }
}

if (!webRoot) {
  log('ERROR web assets not found');
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
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
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
    log(`HTTP ERROR ${error?.stack || error}`);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

function findEdge() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function fallbackBrowser(url) {
  log('EDGE NOT FOUND, fallback browser');
  const child = spawn('cmd.exe', ['/c', 'start', '', url], {
    stdio: 'ignore',
    windowsHide: true,
    detached: true,
  });
  child.unref();
  log('Server is running in fallback mode. Close this process to stop.');
}

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/index.html?web=1`;
  log(`serving ${webRoot} at ${url}`);
  const edge = findEdge();
  if (!edge) {
    fallbackBrowser(url);
    setTimeout(() => {
      log('fallback timeout; exiting');
      server.close();
      process.exit(0);
    }, 12 * 60 * 60 * 1000);
    return;
  }
  // Use a per-launch profile: force-killed Edge processes can leave stale
  // SingletonLock files behind, which makes the next app-mode launch exit
  // immediately with code 0. A fresh profile guarantees a fresh app window.
  const profile = path.join(localRoot, `EdgeProfile-${process.pid}`);
  try {
    fs.rmSync(profile, { recursive: true, force: true });
    fs.mkdirSync(profile, { recursive: true });
  } catch {
    /* ignore */
  }
  const args = [
    `--app=${url}`,
    '--window-size=1620,1020',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-mode',
  ];
  log(`launching edge ${edge}`);
  const child = spawn(edge, args, {
    stdio: 'ignore',
    windowsHide: false,
    detached: false,
    cwd: path.dirname(edge),
  });
  let launched = true;
  child.on('error', (error) => {
    launched = false;
    log(`EDGE ERROR ${error?.stack || error}`);
    fallbackBrowser(url);
  });
  child.on('exit', (code) => {
    log(`edge exited code=${code}`);
    if (launched) {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 2000).unref();
    }
  });
});

setTimeout(() => {
  log('idle timeout; exiting');
  server.close();
  process.exit(0);
}, 12 * 60 * 60 * 1000).unref();
