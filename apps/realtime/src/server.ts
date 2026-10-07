import { createServer, type Server } from 'node:http';

/**
 * Creates the realtime HTTP server. Phase 3 attaches Colyseus to it; until then it answers
 * the health check that deployments and local tooling poll.
 */
export function createRealtimeServer(): Server {
  return createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not found' }));
  });
}
