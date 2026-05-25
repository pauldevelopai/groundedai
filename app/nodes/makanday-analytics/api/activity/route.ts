// GET /nodes/makanday-analytics/api/activity → handlers.getActivity(host)
import { callNode } from '../../_node';

export async function GET() {
  return callNode('getActivity');
}
