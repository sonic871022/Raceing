import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { advanceTick } from '@yugao-gaos/turn-based-grid-sdk/engine';
import { racingReducer } from '../reducer/reducer.mjs';

const port = Number.parseInt(process.env.PORT ?? '8787', 10);
let state = racingReducer.init(undefined, 42);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.resolve(__dirname, '../client-web');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function serveStatic(request, response) {
  if (request.method !== 'GET') {
    writeJson(response, 404, { error: 'not found' });
    return;
  }

  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = path.resolve(staticRoot, relativePath);

  if (!filePath.startsWith(staticRoot + path.sep) && filePath !== staticRoot) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    response.writeHead(200, { 'content-type': contentType });
    response.end(data);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    } else {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error instanceof Error ? error.message : 'internal error');
    }
  }
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body, null, 2));
}

function collectJson(request) {
  return new Promise((resolve, reject) => {
    let data = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      data += chunk;
    });
    request.on('end', () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && request.url === '/state') {
    writeJson(response, 200, {
      state,
      view: racingReducer.view(state),
    });
    return;
  }

  if (request.method === 'POST' && request.url === '/reset') {
    state = racingReducer.init(undefined, Date.now());
    writeJson(response, 200, {
      state,
      view: racingReducer.view(state),
    });
    return;
  }

  if (request.method === 'POST' && request.url === '/advance') {
    try {
      const payload = await collectJson(request);
      const action = payload && typeof payload === 'object' && 'id' in payload
        ? payload
        : { id: 'cruise' };
      state = advanceTick(racingReducer, state, [action]);
      writeJson(response, 200, {
        acceptedAction: action,
        state,
        view: racingReducer.view(state),
      });
    } catch (error) {
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'invalid request body',
      });
    }
    return;
  }

  await serveStatic(request, response);
});

server.listen(port, () => {
  console.log(`Racing dev server listening on http://127.0.0.1:${port}`);
});
