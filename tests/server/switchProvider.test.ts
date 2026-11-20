import { createFakeProvider, answer } from '../../server/claude/fakeProvider';
import { createSwitchProvider } from '../../server/claude/switchProvider';
import type { ClaudeRequest } from '../../server/claude/provider';

const req: ClaudeRequest = { systemPrompt: '', prompt: 'x', readableDirs: [], files: [], model: null };

test('each call goes to the provider of the connection mode chosen at that moment', async () => {
  const cli = createFakeProvider(() => answer('cli'));
  const api = createFakeProvider(() => answer('api'));
  const config = { connection: 'claude-code' as 'claude-code' | 'api' };
  const p = createSwitchProvider(() => (config.connection === 'api' ? api : cli));
  for await (const _ of p.send(req)) { /* drain */ }
  config.connection = 'api';
  for await (const _ of p.send(req)) { /* drain */ }
  expect(cli.calls).toHaveLength(1);
  expect(api.calls).toHaveLength(1);
});
