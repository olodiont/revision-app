import type {
  Attachment, Comment, CorrectionVersion, Exercise, Id, LibraryTree, Message, SearchHit,
} from '../shared/types';

export class AiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.message === 'string') return body.message;
  } catch { /* not JSON */ }
  return `Erreur ${res.status}`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new AiError('http', await errorMessage(res));
  return res.json() as Promise<T>;
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  const res = await fetch(path, init);
  if (!res.ok) throw new AiError('http', await errorMessage(res));
  return res.json() as Promise<T>;
}

export const api = { get, send };

/**
 * POSTs to an AI endpoint and reads its SSE stream.
 * Calls onDelta for each text chunk, resolves with the `done` payload, rejects with AiError otherwise.
 */
export async function streamAi<T>(
  path: string, body: unknown, onDelta: (text: string) => void, signal?: AbortSignal,
): Promise<T> {
  const init: RequestInit = { method: 'POST', signal };
  if (body instanceof FormData) init.body = body;
  else {
    init.body = JSON.stringify(body ?? {});
    init.headers = { 'content-type': 'application/json' };
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new AiError('network', "Impossible de joindre l'app. Est-elle toujours lancée ?");
  }
  if (!res.ok || !res.body) throw new AiError('http', await errorMessage(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (block: string): { done: T } | null => {
    const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
    const dataLines = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6));
    if (!dataLines.length) return null;
    const data = JSON.parse(dataLines.join('\n'));
    if (event === 'delta') onDelta(data.text);
    else if (event === 'done') return { done: data as T };
    else if (event === 'error') throw new AiError(data.code, data.message);
    return null;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const r = handle(block.replace(/\r/g, ''));
        if (r) return r.done;
      }
      if (done) break;
    }
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError('interrupted', 'La réponse a été interrompue.');
  }
  throw new AiError('interrupted', 'La réponse a été interrompue.');
}

// ----- shapes returned by the server -----
export interface ExerciseDetail {
  exercise: Exercise;
  attachments: Attachment[];
  versions: CorrectionVersion[];
  comments: Comment[];
  messagesByComment: Record<Id, Message[]>;
  children: Exercise[];
}
export type { LibraryTree, SearchHit };
