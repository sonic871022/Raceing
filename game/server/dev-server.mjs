import http from 'node:http';
import { advanceTick } from '@yugao-gaos/turn-based-grid-sdk/engine';
import { racingReducer } from '../reducer/reducer.mjs';

const port = Number.parseInt(process.env.PORT ?? '8787', 10);
let state = racingReducer.init(undefined, 42);

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

  writeJson(response, 404, {
    error: 'not found',
    routes: ['GET /health', 'GET /state', 'POST /advance', 'POST /reset'],
  });
});

server.listen(port, () => {
  console.log(`Racing dev server listening on http://127.0.0.1:${port}`);
});
