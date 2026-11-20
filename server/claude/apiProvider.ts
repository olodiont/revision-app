/*
 * Calls Claude through the Anthropic API with the user's own API key (console.anthropic.com),
 * as an alternative to Claude Code: this is the mode to use when the app is shared with others.
 * Images and PDFs are attached to the message as base64 blocks.
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { ERROR_MESSAGES_FR, type ClaudeEvent, type ClaudeProvider, type ClaudeRequest } from './provider';

export const DEFAULT_API_MODEL = 'claude-opus-5-5';

const IMAGE_TYPES: Record<string, 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
};

type StreamLike = AsyncIterable<any> & { finalMessage(): Promise<{ stop_reason: string | null }> };
export type StreamFn = (params: any, opts: { signal?: AbortSignal }) => StreamLike;

export interface ApiProviderOptions {
  /** Read at each call, so a key saved in the settings is used right away. */
  apiKey: () => string | null;
  /** Injected in tests; by default the official SDK's streaming call. */
  streamFn?: StreamFn;
}

function fileBlocks(files: string[]): any[] {
  const blocks: any[] = [];
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    const data = readFileSync(f).toString('base64');
    if (IMAGE_TYPES[ext]) blocks.push({ type: 'image', source: { type: 'base64', media_type: IMAGE_TYPES[ext], data } });
    else if (ext === '.pdf') blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
  }
  return blocks;
}

const API_MESSAGES = {
  noKey: "Aucune clé API Anthropic enregistrée. Ajoute-la dans « Stockage et réglages », ou repasse en mode Claude Code.",
  badKey: 'Clé API Anthropic refusée. Vérifie-la dans « Stockage et réglages ».',
  refusal: "Claude a refusé de répondre à cette demande.",
};

export function createApiProvider(opts: ApiProviderOptions): ClaudeProvider {
  const defaultStream: StreamFn = (params, { signal }) => {
    const client = new Anthropic({ apiKey: opts.apiKey() ?? undefined });
    return client.beta.messages.stream(params, { signal }) as unknown as StreamLike;
  };
  const streamFn = opts.streamFn ?? defaultStream;

  return {
    async *send(req: ClaudeRequest): AsyncIterable<ClaudeEvent> {
      if (!opts.apiKey()) {
        yield { type: 'error', code: 'not_logged_in', message: API_MESSAGES.noKey };
        return;
      }
      if (req.signal?.aborted) {
        yield { type: 'error', code: 'interrupted', message: ERROR_MESSAGES_FR.interrupted };
        return;
      }
      let text = '';
      try {
        const stream = streamFn({
          model: req.model || DEFAULT_API_MODEL,
          max_tokens: 64000,
          // The app's instructions never change: cache them across calls.
          system: [{ type: 'text', text: req.systemPrompt, cache_control: { type: 'ephemeral' } }],
          output_config: { effort: 'medium' },
          // If the model declines for a safety reason, the API retries on a suitable fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          messages: [{ role: 'user', content: [...fileBlocks(req.files), { type: 'text', text: req.prompt }] }],
        }, { signal: req.signal });

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            text += event.delta.text;
            yield { type: 'text', text: event.delta.text };
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') {
          yield { type: 'error', code: 'unknown', message: API_MESSAGES.refusal };
          return;
        }
        yield { type: 'done', fullText: text };
      } catch (err) {
        if (req.signal?.aborted || err instanceof Anthropic.APIUserAbortError) {
          yield { type: 'error', code: 'interrupted', message: ERROR_MESSAGES_FR.interrupted };
        } else if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
          yield { type: 'error', code: 'not_logged_in', message: API_MESSAGES.badKey };
        } else if (err instanceof Anthropic.RateLimitError) {
          yield { type: 'error', code: 'usage_limit', message: "Limite de débit de l'API atteinte. Réessaie dans un moment." };
        } else if (err instanceof Anthropic.APIError) {
          yield { type: 'error', code: 'unknown', message: `${ERROR_MESSAGES_FR.unknown} (API ${err.status ?? ''})`.trim() };
        } else {
          yield { type: 'error', code: 'unknown', message: ERROR_MESSAGES_FR.unknown };
        }
      }
    },
  };
}
