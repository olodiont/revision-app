import { useEffect, useState } from 'react';
import type { Id, LibraryTree, SearchHit } from '../../shared/types';
import { api } from '../api';
import { go } from '../App';

interface Props {
  tree: LibraryTree;
  selectedId: Id | null;
  onChanged: () => void;
  storageActive: boolean;
}

type ExerciseItem = LibraryTree['subjects'][number]['chapters'][number]['exercises'][number];

/** Orders exercises so each variant sits right under its parent, with its depth. */
function nestExercises(list: ExerciseItem[]): { item: ExerciseItem; depth: number }[] {
  const byParent = new Map<Id | null, ExerciseItem[]>();
  const ids = new Set(list.map((e) => e.id));
  for (const e of list) {
    const key = e.parentId !== null && ids.has(e.parentId) ? e.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), e]);
  }
  const out: { item: ExerciseItem; depth: number }[] = [];
  const walk = (parent: Id | null, depth: number) => {
    for (const e of byParent.get(parent) ?? []) {
      out.push({ item: e, depth });
      walk(e.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function Library({ tree, selectedId, onChanged, storageActive }: Props) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const q = query.trim();
    if (!q) { setHits(null); return; }
    const t = setTimeout(() => {
      api.get<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`).then(setHits).catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); onChanged(); } catch (e) { alert((e as Error).message); }
  };
  const ask = (label: string, initial = '') => {
    const v = window.prompt(label, initial);
    return v && v.trim() ? v.trim() : null;
  };

  const addSubject = () => { const name = ask('Nom de la matière'); if (name) void act(() => api.send('POST', '/api/subjects', { name })); };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-line space-y-2">
        <div className="flex items-center justify-between">
          <a href="#/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/logo.svg" alt="" className="h-6 w-6" />Révision
          </a>
          <button className="btn btn-ghost text-xs" onClick={addSubject}>+ matière</button>
        </div>
        <input
          className="field"
          type="search"
          placeholder="Rechercher…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher dans les exercices"
        />
      </div>

      <nav className="flex-1 overflow-y-auto p-2 text-sm">
        {hits !== null ? (
          <SearchResults hits={hits} onPick={() => setQuery('')} />
        ) : tree.subjects.length === 0 ? (
          <p className="p-3 text-muted">Aucune matière pour l'instant.</p>
        ) : (
          tree.subjects.map((s) => {
            const sKey = `s${s.id}`;
            return (
              <div key={s.id} className="mb-2">
                <Row
                  label={s.name}
                  strong
                  open={!collapsed[sKey]}
                  onToggle={() => setCollapsed((c) => ({ ...c, [sKey]: !c[sKey] }))}
                  actions={[
                    ['+ chapitre', () => { const name = ask('Nom du chapitre'); if (name) void act(() => api.send('POST', '/api/chapters', { subjectId: s.id, name })); }],
                    ['Renommer', () => { const name = ask('Nouveau nom', s.name); if (name) void act(() => api.send('PATCH', `/api/subjects/${s.id}`, { name })); }],
                    ['Exporter', () => { window.location.href = `/api/export/subject/${s.id}`; }],
                    ['Supprimer', () => {
                      if (confirm(`Supprimer la matière « ${s.name} » et tout son contenu (exercices, corrections, commentaires, fichiers) ?`)) {
                        void act(() => api.send('DELETE', `/api/subjects/${s.id}`));
                      }
                    }],
                  ]}
                />
                {!collapsed[sKey] && s.chapters.map((ch) => {
                  const cKey = `c${ch.id}`;
                  return (
                    <div key={ch.id} className="ml-3">
                      <Row
                        label={ch.name}
                        open={!collapsed[cKey]}
                        onToggle={() => setCollapsed((c) => ({ ...c, [cKey]: !c[cKey] }))}
                        actions={[
                          ['+ exo', () => go(`#/nouveau/${ch.id}`)],
                          ['Renommer', () => { const name = ask('Nouveau nom', ch.name); if (name) void act(() => api.send('PATCH', `/api/chapters/${ch.id}`, { name })); }],
                          ...(tree.subjects.length > 1 ? [['Déplacer', () => {
                            const names = tree.subjects.map((x, i) => `${i + 1}. ${x.name}`).join('\n');
                            const pick = ask(`Déplacer vers quelle matière ? (numéro)\n${names}`);
                            const target = pick ? tree.subjects[Number(pick) - 1] : undefined;
                            if (target) void act(() => api.send('PATCH', `/api/chapters/${ch.id}`, { subjectId: target.id }));
                          }] as [string, () => void]] : []),
                          ['Supprimer', () => {
                            if (confirm(`Supprimer le chapitre « ${ch.name} » et tous ses exercices ?`)) {
                              void act(() => api.send('DELETE', `/api/chapters/${ch.id}`));
                            }
                          }],
                        ]}
                      />
                      {!collapsed[cKey] && (
                        <ul className="ml-4">
                          {nestExercises(ch.exercises).map(({ item, depth }) => (
                            <li key={item.id}>
                              <a
                                href={`#/exo/${item.id}`}
                                className={`block truncate rounded px-2 py-1 hover:bg-sunken ${selectedId === item.id ? 'bg-accent-soft font-medium' : ''}`}
                                style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
                                title={item.title}
                              >
                                {depth > 0 && <span className="text-muted">↳ </span>}{item.title}
                              </a>
                            </li>
                          ))}
                          {ch.exercises.length === 0 && (
                            <li><a className="block px-2 py-1 text-muted hover:underline" href={`#/nouveau/${ch.id}`}>+ ajouter un exercice</a></li>
                          )}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </nav>

      <div className="border-t border-line p-2 text-sm">
        <a href="#/stockage" className={`block rounded px-2 py-1.5 hover:bg-sunken ${storageActive ? 'bg-accent-soft font-medium' : ''}`}>
          Stockage et réglages
        </a>
      </div>
    </div>
  );
}

function Row({ label, strong, open, onToggle, actions }: {
  label: string; strong?: boolean; open: boolean; onToggle: () => void; actions: [string, () => void][];
}) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="group relative flex items-center rounded hover:bg-sunken">
      <button className="flex-1 truncate text-left px-1.5 py-1" onClick={onToggle} aria-expanded={open}>
        <span className="inline-block w-3 text-muted">{open ? '▾' : '▸'}</span>{' '}
        <span className={strong ? 'font-semibold' : ''}>{label}</span>
      </button>
      <button
        className="px-1.5 text-muted opacity-0 group-hover:opacity-100 focus:opacity-100"
        onClick={() => setMenu((m) => !m)}
        aria-label={`Actions pour ${label}`}
      >⋯</button>
      {menu && (
        <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-line bg-panel p-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
          {actions.map(([name, fn]) => (
            <button key={name} className={`block w-full rounded px-2 py-1 text-left hover:bg-sunken ${name === 'Supprimer' ? 'text-danger' : ''}`}
              onClick={() => { setMenu(false); fn(); }}>{name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const SOURCE_LABEL: Record<SearchHit['source'], string> = {
  title: 'titre', statement: 'énoncé', correction: 'correction', comment: 'commentaire',
};

function SearchResults({ hits, onPick }: { hits: SearchHit[]; onPick: () => void }) {
  if (!hits.length) return <p className="p-3 text-muted">Aucun résultat.</p>;
  return (
    <ul className="space-y-1">
      {hits.map((h, i) => (
        <li key={`${h.exerciseId}-${h.source}-${i}`}>
          <a href={`#/exo/${h.exerciseId}`} onClick={onPick} className="block rounded px-2 py-1.5 hover:bg-sunken">
            <div className="font-medium truncate">{h.title}</div>
            <div className="text-xs text-muted"><span className="uppercase tracking-wide">{SOURCE_LABEL[h.source]}</span> · {h.snippet}</div>
          </a>
        </li>
      ))}
    </ul>
  );
}
