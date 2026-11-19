import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAnchor } from '../../shared/anchor';
import type { Comment, CorrectionVersion, Exercise, Id, LibraryTree, Message } from '../../shared/types';
import { api, type ExerciseDetail } from '../api';
import { go } from '../App';
import { domSelectionToSourceRange, type SourceRange } from '../lib/selection';
import { splitIntoSteps } from '../lib/steps';
import { useAi } from '../lib/useAi';
import { CommentsPanel } from './CommentsPanel';
import { CommentThread } from './CommentThread';
import { DiffView } from './DiffView';
import { Markdown } from './Markdown';
import { Modal } from './Modal';
import { NewCommentCard } from './NewCommentCard';
import { SelectionPopover } from './SelectionPopover';
import { VersionBar, versionLabel } from './VersionBar';

interface Props { id: Id; tree: LibraryTree; onLibraryChanged: () => void }

type FixProposal = { commentId: Id; start: number; end: number; before: string; after: string };
type Proposal =
  | { kind: 'fix'; data: FixProposal }
  | { kind: 'regenerate'; before: string; after: string; instruction: string };

export function ExerciseView({ id, tree, onLibraryChanged }: Props) {
  const [detail, setDetail] = useState<ExerciseDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<Id | null>(null);
  const [selection, setSelection] = useState<{ range: SourceRange; rect: DOMRect } | null>(null);
  const [draft, setDraft] = useState<SourceRange | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [modal, setModal] = useState<null | 'regenerate' | 'check' | 'similar' | 'move'>(null);
  const [instruction, setInstruction] = useState('');
  const ai = useAi();

  const scrollRef = useRef<HTMLDivElement>(null);
  const correctionRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWide(el.clientWidth >= 940));
    ro.observe(el);
    return () => ro.disconnect();
  });

  const reload = useCallback(async () => {
    try {
      const d = await api.get<ExerciseDetail>(`/api/exercises/${id}`);
      setDetail(d);
      setLoadError(null);
      return d;
    } catch (e) {
      setLoadError((e as Error).message);
      return null;
    }
  }, [id]);

  useEffect(() => {
    void reload().then((d) => { if (d?.exercise.parentId !== null && d?.exercise.parentId !== undefined) setTestMode(true); });
  }, [reload]);

  const versions = detail?.versions ?? [];
  const current: CorrectionVersion | undefined = versions.at(-1);
  const shownNumber = viewing ?? current?.number;
  const shown = versions.find((v) => v.number === shownNumber) ?? current;
  const isCurrent = !!current && shown?.id === current.id;
  const comments = detail?.comments ?? [];

  const highlights = useMemo(() => {
    if (!isCurrent || testMode) return [];
    return comments
      .filter((c) => c.kind === 'passage' && c.status === 'open' && c.anchor)
      .map((c) => ({ start: c.anchor!.start, end: c.anchor!.end, commentId: c.id, active: c.id === activeId }))
      .concat(draft ? [{ start: draft.start, end: draft.end, commentId: -1, active: true }] : []);
  }, [comments, activeId, isCurrent, testMode, draft]);

  // ----- selection → "Commenter" -----
  const onMouseUp = () => {
    if (!isCurrent || testMode || !correctionRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { setSelection(null); return; }
    const range = domSelectionToSourceRange(sel, correctionRef.current);
    if (!range) { setSelection(null); return; }
    setSelection({ range, rect: sel.getRangeAt(0).getBoundingClientRect() });
  };
  useEffect(() => {
    const clear = () => { if (!window.getSelection()?.toString()) setSelection(null); };
    document.addEventListener('selectionchange', clear);
    return () => document.removeEventListener('selectionchange', clear);
  }, []);

  const startDraft = (range: SourceRange) => {
    setDraft(range);
    setSelection(null);
    setActiveId(null);
    window.getSelection()?.removeAllRanges();
    ai.dismiss('new');
  };

  // ----- AI actions -----
  const sendNewComment = (question: string) => {
    if (!draft || !current) return;
    const anchor = createAnchor(current.markdown, draft.start, draft.end, draft.kind);
    void ai.run<{ comment: Comment }>('new', '/api/comments', { exerciseId: id, anchor, question }, async (r) => {
      await reload();
      setDraft(null);
      setActiveId(r.comment.id);
    }).then((r) => { if (!r) void reload(); });
  };

  const ask = (c: Comment, question: string) =>
    void ai.run(`c${c.id}`, `/api/comments/${c.id}/messages`, { question }, () => reload().then(() => {})).then((r) => { if (!r) void reload(); });
  const diagram = (c: Comment, request: string) =>
    void ai.run(`c${c.id}`, `/api/comments/${c.id}/diagram`, { request }, () => reload().then(() => {})).then((r) => { if (!r) void reload(); });
  const fix = (c: Comment) =>
    void ai.run<{ proposal: Omit<FixProposal, 'commentId'> }>(`c${c.id}`, `/api/comments/${c.id}/fix`, {}, (r) => {
      setProposal({ kind: 'fix', data: { ...r.proposal, commentId: c.id } });
    });

  const generate = () =>
    void ai.run('generate', `/api/exercises/${id}/generate`, { instruction }, async () => {
      setInstruction('');
      await reload();
    });

  const regenerate = () => {
    if (!current) return;
    const instr = instruction.trim();
    setModal(null);
    void ai.run<{ proposal: string }>('regenerate', `/api/exercises/${id}/regenerate`, { instruction: instr }, (r) => {
      setProposal({ kind: 'regenerate', before: current.markdown, after: r.proposal, instruction: instr });
      setInstruction('');
    });
  };

  const acceptProposal = async () => {
    if (!proposal) return;
    try {
      if (proposal.kind === 'fix') {
        const { commentId, start, end, before, after } = proposal.data;
        await api.send('POST', `/api/comments/${commentId}/fix/accept`, { start, end, before, after });
      } else {
        await api.send('POST', `/api/exercises/${id}/regenerate/accept`, { proposal: proposal.after, instruction: proposal.instruction });
      }
      setProposal(null);
      setViewing(null);
      await reload();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const similar = () => {
    setModal('similar');
    void ai.run<{ exercise: Exercise }>('similar', `/api/exercises/${id}/similar`, {}, (r) => {
      setModal(null);
      onLibraryChanged();
      go(`#/exo/${r.exercise.id}`);
    });
  };

  const [answerText, setAnswerText] = useState('');
  const [answerFiles, setAnswerFiles] = useState<File[]>([]);
  const check = () => {
    const fd = new FormData();
    fd.append('answerText', answerText);
    answerFiles.forEach((f) => fd.append('files', f));
    setModal(null);
    void ai.run<{ comment: Comment }>('check', `/api/exercises/${id}/check`, fd, async (r) => {
      setAnswerText('');
      setAnswerFiles([]);
      await reload();
      setActiveId(r.comment.id);
    }).then((r) => { if (!r) void reload(); });
  };

  const setStatus = async (c: Comment) => {
    await api.send('PATCH', `/api/comments/${c.id}`, { status: c.status === 'resolved' ? 'open' : 'resolved' });
    if (c.status !== 'resolved') setActiveId(null);
    await reload();
  };
  const remove = async (c: Comment) => {
    await api.send('DELETE', `/api/comments/${c.id}`);
    setActiveId(null);
    await reload();
  };

  if (loadError) return <p className="p-8 text-danger">{loadError}</p>;
  if (!detail) return <p className="p-8 text-muted">Chargement…</p>;
  const { exercise, attachments } = detail;

  const renderThread = (c: Comment) => (
    <CommentThread
      comment={c}
      messages={(detail.messagesByComment[c.id] ?? []) as Message[]}
      active={activeId === c.id}
      task={ai.tasks[`c${c.id}`] ?? (c.kind === 'check-answer' && activeId === c.id ? ai.tasks.check : undefined)}
      onActivate={() => { setActiveId(c.id); setDraft(null); }}
      onAsk={(q) => ask(c, q)}
      onDiagram={(r) => diagram(c, r)}
      onFix={c.kind === 'passage' ? () => fix(c) : undefined}
      onToggleResolved={() => void setStatus(c)}
      onDelete={() => void remove(c)}
      onRetry={() => ai.retry(`c${c.id}`)}
    />
  );

  const chapters = tree.subjects.flatMap((s) => s.chapters.map((c) => ({ id: c.id, label: `${s.name} › ${c.name}` })));
  const place = chapters.find((c) => c.id === exercise.chapterId)?.label;
  const steps = shown && testMode ? splitIntoSteps(shown.markdown) : [];
  const statementMd = exercise.statementTranscription ?? exercise.statementText;

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto" onClick={() => { setActiveId(null); }}>
      <div className={`mx-auto flex max-w-[1180px] ${wide ? 'flex-row gap-8 px-8' : 'flex-col gap-6 px-5'} py-6`}>
        {/* ---------- main column ---------- */}
        <article className={`min-w-0 flex-1 ${wide ? 'max-w-[720px]' : ''}`} onClick={(e) => e.stopPropagation()}>
          <header className="mb-5 space-y-2">
            <p className="text-sm text-muted">{place}</p>
            <div className="flex flex-wrap items-start gap-2">
              <h1 className="mr-auto text-2xl font-semibold leading-tight">{exercise.title}</h1>
              <HeaderMenu
                onRename={async () => {
                  const t = prompt('Nouveau titre', exercise.title)?.trim();
                  if (t) { await api.send('PATCH', `/api/exercises/${id}`, { title: t }); await reload(); onLibraryChanged(); }
                }}
                onMove={() => setModal('move')}
                onExport={() => { window.location.href = `/api/export/exercise/${id}`; }}
                onDelete={async () => {
                  if (confirm(`Supprimer « ${exercise.title} » avec sa correction, ses commentaires, ses fichiers et ses variantes ?`)) {
                    await api.send('DELETE', `/api/exercises/${id}`);
                    onLibraryChanged();
                    go('#/');
                  }
                }}
              />
            </div>
            {exercise.parentId !== null && (
              <a className="text-sm text-accent hover:underline" href={`#/exo/${exercise.parentId}`}>↑ Exercice d'origine</a>
            )}
          </header>

          {/* statement */}
          <section className="rounded-xl border border-line bg-panel p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Énoncé</h2>
            {statementMd.trim() ? <Markdown source={statementMd} /> : !attachments.length && <p className="text-muted">Pas d'énoncé texte.</p>}
            {exercise.statementTranscription && <p className="mt-2 text-xs text-muted">Énoncé recopié par Claude depuis le fichier d'origine.</p>}
            {attachments.length > 0 && (
              <details className="mt-3" open={!exercise.statementTranscription}>
                <summary className="cursor-pointer text-sm text-muted">Fichiers d'origine ({attachments.length})</summary>
                <div className="mt-2 flex flex-wrap gap-3">
                  {attachments.map((a) => a.mime.startsWith('image/') ? (
                    <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
                      <img src={`/api/attachments/${a.id}`} alt={a.fileName} className="max-h-72 rounded-md border border-line" />
                    </a>
                  ) : (
                    <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="btn">📄 {a.fileName}</a>
                  ))}
                </div>
              </details>
            )}
          </section>

          {/* revision bar */}
          {current && (
            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-sm">
              <span className="mr-auto font-medium text-muted">Réviser</span>
              {testMode ? (
                <>
                  {steps.length > 1 && revealed < steps.length && (
                    <button className="btn" onClick={() => setRevealed((n) => n + 1)}>Étape suivante ({revealed}/{steps.length})</button>
                  )}
                  <button className="btn btn-primary" onClick={() => { setTestMode(false); setRevealed(0); }}>Révéler tout</button>
                </>
              ) : (
                <button className="btn" onClick={() => { setTestMode(true); setRevealed(0); setActiveId(null); setDraft(null); }}
                  title="Masque la correction et les commentaires (aucun appel à Claude)">Me tester</button>
              )}
              <button className="btn" disabled={!!ai.tasks.similar?.running} onClick={similar} title="Claude invente une variante (utilise ton abonnement)">Exo similaire</button>
              <button className="btn" disabled={!!ai.tasks.check?.running} onClick={() => setModal('check')} title="Claude compare ta réponse à la correction">Vérifie ma réponse</button>
            </div>
          )}
          {ai.tasks.check && (ai.tasks.check.running || ai.tasks.check.error) && (
            <TaskBanner task={ai.tasks.check} label="Vérification de ta réponse…" onRetry={() => ai.retry('check')} onClose={() => ai.dismiss('check')} />
          )}

          {/* correction */}
          <section className="mt-5">
            {!current ? (
              <GeneratePanel
                instruction={instruction}
                setInstruction={setInstruction}
                task={ai.tasks.generate}
                onGenerate={generate}
                onRetry={() => ai.retry('generate')}
              />
            ) : (
              <>
                <VersionBar versions={versions} viewing={shown!.number} comments={comments}
                  onView={(n) => { setViewing(n === current.number ? null : n); setDraft(null); setActiveId(null); }}
                  onRegenerate={() => setModal('regenerate')} busy={!!ai.tasks.regenerate?.running} />
                {!isCurrent && (
                  <p className="mt-2 rounded-md bg-mark/50 px-3 py-1.5 text-sm">
                    {versionLabel(shown!, comments)} — lecture seule.{' '}
                    <button className="underline" onClick={() => setViewing(null)}>Revenir à la version actuelle</button>
                  </p>
                )}
                {ai.tasks.regenerate && (ai.tasks.regenerate.running || ai.tasks.regenerate.error) && (
                  <TaskBanner task={ai.tasks.regenerate} label="Claude réécrit la correction…" onRetry={() => ai.retry('regenerate')} onClose={() => ai.dismiss('regenerate')} />
                )}
                <div ref={correctionRef} className="mt-3" onMouseUp={onMouseUp}>
                  {testMode ? (
                    revealed === 0 ? (
                      <p className="rounded-lg border border-dashed border-line p-6 text-center text-muted">
                        Correction masquée. Refais l'exercice, puis révèle la correction (en entier ou étape par étape).
                      </p>
                    ) : <Markdown source={steps.slice(0, revealed).join('\n\n')} />
                  ) : (
                    <Markdown
                      source={shown!.markdown}
                      highlights={highlights}
                      onMarkClick={(cid) => { if (cid > 0) { setActiveId(cid); setDraft(null); } }}
                      onBlockClick={(r) => { if (isCurrent) startDraft({ ...r, kind: 'block' }); }}
                    />
                  )}
                </div>
                {isCurrent && !testMode && (
                  <p className="mt-6 text-xs text-muted">
                    Astuce : surligne un passage (ou clique sur une formule / un schéma) pour poser une question dessus.
                  </p>
                )}
              </>
            )}
          </section>
        </article>

        {/* ---------- comments column ---------- */}
        <aside className={wide ? 'w-80 shrink-0 pt-[3px]' : 'w-full'} onClick={(e) => e.stopPropagation()}>
          {current && isCurrent && !testMode && (
            <CommentsPanel
              aligned={wide}
              comments={comments}
              correctionRef={correctionRef}
              scrollRef={scrollRef}
              renderThread={renderThread}
              layoutKey={`${activeId}-${comments.length}`}
              draft={draft ? {
                start: draft.start,
                node: (
                  <NewCommentCard
                    quote={current.markdown.slice(draft.start, draft.end)}
                    task={ai.tasks.new}
                    onSend={sendNewComment}
                    onDiagram={() => sendNewComment('Fais un schéma qui explique ce passage.')}
                    onCancel={() => { setDraft(null); ai.dismiss('new'); }}
                    onRetry={() => ai.retry('new')}
                  />
                ),
              } : null}
            />
          )}
        </aside>
      </div>

      {selection && <SelectionPopover rect={selection.rect} onComment={() => startDraft(selection.range)} />}

      {proposal && (
        <Modal wide title={proposal.kind === 'fix' ? 'Correction proposée pour ce passage' : 'Nouvelle version proposée'} onClose={() => setProposal(null)}>
          <p className="mb-2 text-sm text-muted">Barré : retiré · Surligné : ajouté. Rien ne change tant que tu n'acceptes pas.</p>
          <DiffView
            before={proposal.kind === 'fix' ? proposal.data.before : proposal.before}
            after={proposal.kind === 'fix' ? proposal.data.after : proposal.after}
          />
          <h3 className="mt-4 mb-1 text-sm font-semibold">Aperçu</h3>
          <div className="rounded-md border border-line p-3">
            <Markdown source={proposal.kind === 'fix' ? proposal.data.after : proposal.after} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn" onClick={() => setProposal(null)}>Refuser</button>
            <button className="btn btn-primary" onClick={() => void acceptProposal()}>Accepter</button>
          </div>
        </Modal>
      )}

      {modal === 'regenerate' && (
        <Modal title="Refaire toute la correction" onClose={() => setModal(null)}>
          <p className="mb-2 text-sm text-muted">L'ancienne version reste dans l'historique. Tes commentaires seront raccrochés quand c'est possible.</p>
          <input className="field" autoFocus value={instruction} onChange={(e) => setInstruction(e.target.value)}
            placeholder="ex : plus détaillée, explique plutôt que corriger"
            onKeyDown={(e) => { if (e.key === 'Enter' && instruction.trim()) regenerate(); }} />
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn" onClick={() => setModal(null)}>Annuler</button>
            <button className="btn btn-primary" disabled={!instruction.trim()} onClick={regenerate}>Demander à Claude</button>
          </div>
        </Modal>
      )}

      {modal === 'check' && (
        <Modal title="Vérifie ma réponse" onClose={() => setModal(null)}>
          <textarea className="field min-h-32" autoFocus value={answerText} onChange={(e) => setAnswerText(e.target.value)}
            placeholder="Écris ta réponse, ou joins une photo de ta copie." />
          <input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf" className="mt-2 block text-sm"
            onChange={(e) => setAnswerFiles([...(e.target.files ?? [])])} />
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn" onClick={() => setModal(null)}>Annuler</button>
            <button className="btn btn-primary" disabled={!answerText.trim() && !answerFiles.length} onClick={check}>Envoyer à Claude</button>
          </div>
        </Modal>
      )}

      {modal === 'similar' && ai.tasks.similar && (
        <Modal title="Exercice similaire" onClose={() => { ai.dismiss('similar'); setModal(null); }}>
          {ai.tasks.similar.error ? (
            <div className="text-danger">
              <p>{ai.tasks.similar.error}</p>
              <button className="btn mt-2" onClick={() => ai.retry('similar')}>Réessayer</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted">Claude invente une variante… Elle s'ouvrira en mode « Me tester ».</p>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted">{ai.tasks.similar.text.replace(/===CORRECTION===[\s\S]*/, '')}</pre>
            </>
          )}
        </Modal>
      )}

      {modal === 'move' && (
        <Modal title="Déplacer l'exercice" onClose={() => setModal(null)}>
          <select className="field" defaultValue={exercise.chapterId} id="move-target">
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn" onClick={() => setModal(null)}>Annuler</button>
            <button className="btn btn-primary" onClick={async () => {
              const chapterId = Number((document.getElementById('move-target') as HTMLSelectElement).value);
              await api.send('PATCH', `/api/exercises/${id}`, { chapterId });
              setModal(null);
              await reload();
              onLibraryChanged();
            }}>Déplacer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function GeneratePanel({ instruction, setInstruction, task, onGenerate, onRetry }: {
  instruction: string; setInstruction: (s: string) => void; task?: { text: string; error: string | null; running: boolean };
  onGenerate: () => void; onRetry: () => void;
}) {
  if (task && (task.running || task.text || task.error)) {
    return (
      <div className="rounded-xl border border-line bg-panel p-5">
        <p className="mb-2 text-sm text-muted">{task.running ? 'Claude rédige la correction…' : 'Génération interrompue.'}</p>
        {task.text && <Markdown source={task.text.replace(/^[\s\S]*?===CORRECTION===\s*/, '').replace(/^===ENONCE===\s*/, '')} />}
        {task.error && (
          <div className="mt-3 rounded-md border border-danger/60 p-3 text-danger">
            <p>{task.error}</p>
            <p className="text-xs text-muted">Rien n'a été enregistré.</p>
            <button className="btn mt-2" onClick={onRetry}>Réessayer</button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center">
      <p className="mb-3 text-muted">Pas encore de correction pour cet exercice.</p>
      <input className="field mx-auto max-w-md" value={instruction} onChange={(e) => setInstruction(e.target.value)}
        placeholder="Consigne facultative (ex : explique comme à un débutant)" />
      <button className="btn btn-primary mt-3" onClick={onGenerate}>Générer la correction</button>
    </div>
  );
}

function TaskBanner({ task, label, onRetry, onClose }: {
  task: { running: boolean; error: string | null }; label: string; onRetry: () => void; onClose: () => void;
}) {
  return (
    <div className={`mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${task.error ? 'border-danger/60 text-danger' : 'border-line text-muted'}`}>
      <span className="mr-auto">{task.error ?? label}</span>
      {task.error && <button className="btn" onClick={onRetry}>Réessayer</button>}
      <button className="btn btn-ghost" onClick={onClose} aria-label="Fermer">✕</button>
    </div>
  );
}

function HeaderMenu({ onRename, onMove, onExport, onDelete }: {
  onRename: () => void; onMove: () => void; onExport: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-label="Actions de l'exercice">⋯</button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-line bg-panel p-1 text-sm shadow-lg" onMouseLeave={() => setOpen(false)}>
          {([['Renommer', onRename], ['Déplacer', onMove], ['Exporter en Markdown', onExport], ['Supprimer', onDelete]] as const).map(([label, fn]) => (
            <button key={label} className={`block w-full rounded px-2 py-1 text-left hover:bg-sunken ${label === 'Supprimer' ? 'text-danger' : ''}`}
              onClick={() => { setOpen(false); fn(); }}>{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
