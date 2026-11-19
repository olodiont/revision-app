import { AiError, streamAi } from '../../web/api';

function sseResponse(chunks: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

afterEach(() => { vi.unstubAllGlobals(); });

test('streamAi parses delta/done across chunk boundaries and rejects on error event', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
    'event: delta\ndata: {"text":"Bon"}\n\nevent: del',
    'ta\ndata: {"text":"jour"}\n\n',
    'event: done\ndata: {"version":{"number":1}}\n\n',
  ])));
  const deltas: string[] = [];
  const result = await streamAi<{ version: { number: number } }>('/api/x', {}, (t) => deltas.push(t));
  expect(deltas).toEqual(['Bon', 'jour']);
  expect(result.version.number).toBe(1);

  vi.stubGlobal('fetch', vi.fn(async () => sseResponse([
    'event: delta\ndata: {"text":"a"}\n\n',
    'event: error\ndata: {"code":"usage_limit","message":"Limite atteinte"}\n\n',
  ])));
  await expect(streamAi('/api/x', {}, () => {})).rejects.toMatchObject({ code: 'usage_limit', message: 'Limite atteinte' });
});

test('streamAi rejects with the JSON message when the server answers an HTTP error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: "Génère d'abord la correction." }), { status: 409 })));
  const err: any = await streamAi('/api/x', {}, () => {}).catch((e) => e);
  expect(err).toBeInstanceOf(AiError);
  expect(err.message).toBe("Génère d'abord la correction.");
});

test('streamAi rejects as interrupted when the stream ends without done', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => sseResponse(['event: delta\ndata: {"text":"a"}\n\n'])));
  await expect(streamAi('/api/x', {}, () => {})).rejects.toMatchObject({ code: 'interrupted' });
});
