/** Health endpoint polled by deployments and local tooling. */
export function GET(): Response {
  return Response.json({ status: 'ok' });
}
