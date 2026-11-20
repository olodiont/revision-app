import type { ClaudeProvider } from './provider';

/** Sends each call to the provider picked at that moment (Claude Code or API key), so a settings change applies at once. */
export function createSwitchProvider(pick: () => ClaudeProvider): ClaudeProvider {
  return { send: (req) => pick().send(req) };
}
