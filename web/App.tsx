import { useCallback, useEffect, useState } from 'react';
import type { Id, LibraryTree } from '../shared/types';
import { api } from './api';
import { watchServer } from './lib/presence';
import { ExerciseView } from './components/ExerciseView';
import { Library } from './components/Library';
import { Spark } from './components/Spark';
import { NewExerciseForm } from './components/NewExerciseForm';
import { StoragePage } from './components/StoragePage';

export type Route =
  | { page: 'home' }
  | { page: 'exercise'; id: Id }
  | { page: 'new'; chapterId: Id }
  | { page: 'storage' };

export function parseHash(hash: string): Route {
  const m = /^#\/exo\/(\d+)/.exec(hash);
  if (m) return { page: 'exercise', id: Number(m[1]) };
  const n = /^#\/nouveau\/(\d+)/.exec(hash);
  if (n) return { page: 'new', chapterId: Number(n[1]) };
  if (hash.startsWith('#/stockage')) return { page: 'storage' };
  return { page: 'home' };
}

export const go = (hash: string) => { window.location.hash = hash; };

/** Small per-browser preferences (menu folded…); storage can be unavailable, so never let it throw. */
function readPref(key: string): string | null {
  try { return localStorage.getItem(`revision.${key}`); } catch { return null; }
}
function writePref(key: string, value: string): void {
  try { localStorage.setItem(`revision.${key}`, value); } catch { /* ignore */ }
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [tree, setTree] = useState<LibraryTree>({ subjects: [] });
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTree(await api.get<LibraryTree>('/api/library'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // When the console (server) is closed, close this window too, or say so if the browser refuses.
  const [serverGone, setServerGone] = useState(false);
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    return watchServer(() => { setServerGone(true); window.close(); });
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    void reload();
    return () => window.removeEventListener('hashchange', onHash);
  }, [reload]);

  const [menuHidden, setMenuHidden] = useState(() => readPref('menuHidden') === '1');
  const toggleMenu = (hidden: boolean) => { setMenuHidden(hidden); writePref('menuHidden', hidden ? '1' : '0'); };

  if (serverGone) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-sm space-y-3">
          <img src="/logo.svg" alt="" className="mx-auto h-14 w-14" />
          <h1 className="text-xl font-semibold">Révision est fermée</h1>
          <p className="text-muted">Tu peux fermer cette fenêtre. Pour reprendre, relance l'app avec le raccourci du Bureau.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {menuHidden ? (
        <aside className="flex w-11 shrink-0 flex-col items-center gap-3 border-r border-line bg-panel py-3">
          <button className="btn btn-ghost px-2" onClick={() => toggleMenu(false)} aria-label="Afficher le menu" title="Afficher le menu">
            <span aria-hidden>»</span>
          </button>
          <a href="#/" title="Accueil"><img src="/logo.svg" alt="" className="h-6 w-6" /></a>
        </aside>
      ) : (
        <aside className="relative w-72 shrink-0 border-r border-line bg-panel flex flex-col">
          <button className="btn btn-ghost absolute right-1 bottom-1 z-10 px-2 text-muted" onClick={() => toggleMenu(true)}
            aria-label="Masquer le menu" title="Masquer le menu">
            <span aria-hidden>«</span>
          </button>
          <Library
            tree={tree}
            selectedId={route.page === 'exercise' ? route.id : null}
            onChanged={reload}
            storageActive={route.page === 'storage'}
          />
        </aside>
      )}
      <main className="grid-paper flex-1 min-w-0 overflow-hidden">
        {error && <div className="m-4 rounded-md border border-danger p-3 text-danger text-sm">{error}</div>}
        {route.page === 'home' && <Home empty={tree.subjects.length === 0} />}
        {route.page === 'exercise' && <ExerciseView key={route.id} id={route.id} tree={tree} onLibraryChanged={reload} />}
        {route.page === 'new' && (
          <NewExerciseForm
            tree={tree}
            chapterId={route.chapterId}
            onCreated={(id) => { void reload(); go(`#/exo/${id}`); }}
          />
        )}
        {route.page === 'storage' && <StoragePage />}
      </main>
    </div>
  );
}

function Home({ empty }: { empty: boolean }) {
  return (
    <div className="relative h-full overflow-hidden">
      <Spark className="pointer-events-none absolute -left-16 -top-20 h-72 w-72 opacity-95" />
      <Spark className="pointer-events-none absolute -bottom-24 right-10 h-80 w-80 rotate-12 opacity-95" />
      <div className="relative grid h-full place-items-center p-8">
        <div className="max-w-xl text-center">
          <h1 className="font-display text-6xl font-bold leading-none tracking-tight">Révision</h1>
          <p className="mt-5 text-lg text-muted">
            Demande une correction, sélectionne un passage, pose ta question dans la marge.
          </p>
          <p className="mt-8 text-sm text-muted">
            {empty
              ? 'Pour commencer, crée une matière avec « + matière » dans le menu, puis un chapitre.'
              : 'Choisis un exercice dans le menu, ou ajoute-en un avec « + exo » sur un chapitre.'}
          </p>
        </div>
      </div>
    </div>
  );
}
