// GET /nodes/makanday-analytics/api/quality?source=… → handlers.getQuality(host, { source })
import { callNode } from '../../_node';

export async function GET(req: Request) {
  const source = new URL(req.url).searchParams.get('source') ?? undefined;
  return callNode('getQuality', { source });
}
