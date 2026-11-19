import { useCallback, useEffect, useRef, useState } from 'react';
import { AiError, streamAi } from '../api';

export interface AiTask { text: string; error: string | null; running: boolean }

/**
 * Runs AI calls keyed by what they belong to (a comment id, 'generate', 'new'…),
 * keeps the streamed text and the error per key, and remembers the last request for "Réessayer".
 */
export function useAi() {
  const [tasks, setTasks] = useState<Record<string, AiTask>>({});
  const last = useRef<Record<string, () => Promise<unknown>>>({});
  const controllers = useRef<Record<string, AbortController>>({});

  useEffect(() => () => { Object.values(controllers.current).forEach((c) => c.abort()); }, []);

  const run = useCallback(<T,>(key: string, path: string, body: unknown, onDone: (r: T) => void | Promise<void>): Promise<T | null> => {
    const exec = async (): Promise<T | null> => {
      controllers.current[key]?.abort();
      const ac = new AbortController();
      controllers.current[key] = ac;
      setTasks((t) => ({ ...t, [key]: { text: '', error: null, running: true } }));
      try {
        const res = await streamAi<T>(path, body, (d) => {
          setTasks((t) => ({ ...t, [key]: { ...(t[key] ?? { error: null, running: true }), text: (t[key]?.text ?? '') + d } }));
        }, ac.signal);
        setTasks((t) => { const n = { ...t }; delete n[key]; return n; });
        await onDone(res);
        return res;
      } catch (e) {
        if (ac.signal.aborted) return null;
        const msg = e instanceof AiError || e instanceof Error ? e.message : 'Erreur inconnue.';
        setTasks((t) => ({ ...t, [key]: { text: t[key]?.text ?? '', error: msg, running: false } }));
        return null;
      }
    };
    last.current[key] = exec;
    return exec();
  }, []);

  const retry = useCallback((key: string) => { void last.current[key]?.(); }, []);
  const dismiss = useCallback((key: string) => {
    controllers.current[key]?.abort();
    setTasks((t) => { const n = { ...t }; delete n[key]; return n; });
  }, []);

  return { tasks, run, retry, dismiss };
}
