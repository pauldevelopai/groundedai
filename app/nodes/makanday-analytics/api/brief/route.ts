// POST /nodes/makanday-analytics/api/brief → handlers.postBrief(host, { source })
// Generates the editorial brief via host.ai.chat (Haiku-locked, logged to api_costs).
import { callNode } from '../../_node';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return callNode('postBrief', body);
}
