import { createApp } from '../../server/app';
import { fakeDeps } from './helpers';

test('GET /api/health', async () => {
  const res = await createApp(fakeDeps()).request('/api/health');
  expect(await res.json()).toEqual({ ok: true });
});
