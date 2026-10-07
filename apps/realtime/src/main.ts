import { createRealtimeServer } from './server';

const port = Number(process.env.REALTIME_PORT ?? 2567);
const host = process.env.REALTIME_HOST ?? '0.0.0.0';

createRealtimeServer().listen(port, host, () => {
  console.info(`Realtime server listening on http://${host}:${port}`);
});
