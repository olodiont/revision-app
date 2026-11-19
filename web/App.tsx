import { useCallback, useEffect, useState } from 'react';
import type { Id, LibraryTree } from '../shared/types';
import { api } from './api';
import { ExerciseView } from './components/ExerciseView';
import { Library } from './components/Library';
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

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    void reload();
    return () => window.removeEventListener('hashchange', onHash);
  }, [reload]);

  const [menuHidden, setMenuHidden] = useState(() => readPref('menuHidden') === '1');
  const toggleMenu = (hidden: boolean) => { setMenuHidden(hidden); writePref('menuHidden', hidden ? '1' : '0'); };

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
      <main className="flex-1 min-w-0 overflow-hidden">
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
    <div className="h-full grid place-items-center p-8 text-center">
      <div className="max-w-md space-y-3">
        <img src="/logo.svg" alt="" className="mx-auto h-16 w-16" />
        <h1 className="text-2xl font-semibold">Révision</h1>
        <p className="text-muted">
          {empty
            ? 'Commence par créer une matière, puis un chapitre, dans la colonne de gauche.'
            : 'Choisis un exercice à gauche, ou ajoute-en un dans un chapitre avec le bouton « + exo ».'}
        </p>
        <p className="text-muted text-sm">
          Surligne un passage de la correction pour poser une question dessus : la réponse s'affiche en commentaire, dans la marge.
        </p>
      </div>
    </div>
  );
}
