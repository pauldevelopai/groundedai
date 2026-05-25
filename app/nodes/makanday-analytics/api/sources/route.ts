// GET /nodes/makanday-analytics/api/sources → handlers.listSources(host)
import { callNode } from '../../_node';

export async function GET() {
  return callNode('listSources');
}
