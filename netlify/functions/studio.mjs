import { createWebHandler } from '../../server/web-handler.mjs';

export default createWebHandler();
export const config = {
  path: '/api/studio',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'], action: 'rate_limit' },
};
