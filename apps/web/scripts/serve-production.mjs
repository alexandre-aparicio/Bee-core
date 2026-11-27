import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const candidates = [resolve('dist/browser'), resolve('dist')];
const root = candidates.find(path => existsSync(resolve(path, 'index.html')));
if (!root) {
  throw new Error('Angular production output not found. Expected dist/browser/index.html or dist/index.html.');
}

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

const server = createServer((request, response) => {
  const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
  let relativePath;
  try {
    relativePath = (decodeURIComponent(pathname).startsWith('/') ? decodeURIComponent(pathname).slice(1) : decodeURIComponent(pathname));
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  let file = resolve(root, relativePath || 'index.html');
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  if (!existsSync(file) || !statSync(file).isFile()) {
    if (extname(relativePath)) {
      response.writeHead(404).end('Not found');
      return;
    }
    file = resolve(root, 'index.html');
  }

  response.writeHead(200, {
    'Content-Type': types[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
});

const host = '127.0.0.1';
const port = Number(process.env.PORT || 4200);
server.listen(port, host, () => {
  process.stdout.write(`Serving Angular production build from ${root} at http://${host}:${port}\n`);
});
