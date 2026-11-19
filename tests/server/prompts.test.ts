import { join } from 'node:path';
import { buildRequest, SYSTEM_PROMPT } from '../../server/claude/prompts';
import type { Attachment, Exercise, Message } from '../../shared/types';

const dataDir = join('C:', 'data');
const ex: Exercise = {
  id: 7, chapterId: 1, parentId: null, title: 'Exo 3', statementText: 'Calculer ∫ ln x dx',
  statementTranscription: null, createdAt: '',
};
const msg = (role: Message['role'], content: string): Message => ({ id: 1, commentId: 1, role, content, createdAt: '' });
const png: Attachment = { id: 1, exerciseId: 7, fileName: 'sujet.png', mime: 'image/png', relPath: 'fichiers/7/sujet.png', size: 1, extractedText: null };
const docx: Attachment = { id: 2, exerciseId: 7, fileName: 'td.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', relPath: 'fichiers/7/td.docx', size: 1, extractedText: 'Texte du TD Word' };

test('comment request contains statement, current correction, quote, this thread only, question', () => {
  const r = buildRequest({
    kind: 'comment', exercise: ex, attachments: [], current: 'CORRECTION COURANTE', quote: 'u = ln x',
    thread: [msg('user', 'Q1 de ce fil'), msg('assistant', 'R1 de ce fil')], question: 'Pourquoi u ?',
  }, { dataDir, model: null });
  for (const s of ['Calculer ∫ ln x dx', 'CORRECTION COURANTE', 'u = ln x', 'Q1 de ce fil', 'R1 de ce fil', 'Pourquoi u ?']) {
    expect(r.prompt).toContain(s);
  }
  expect(r.systemPrompt).toBe(SYSTEM_PROMPT);
});

test('comment request never contains text from another thread', () => {
  const other = [msg('user', 'QUESTION AUTRE FIL')];
  const mine = [msg('user', 'question de mon fil')];
  const r = buildRequest({ kind: 'comment', exercise: ex, attachments: [], current: 'c', quote: 'q', thread: mine, question: 'x' }, { dataDir, model: null });
  expect(r.prompt).not.toContain(other[0].content);
});

test('generate with an image attachment lists its absolute path and adds fichiers/<id> to readableDirs', () => {
  const r = buildRequest({ kind: 'generate', exercise: ex, attachments: [png], instruction: null }, { dataDir, model: null });
  expect(r.prompt).toContain(join(dataDir, 'fichiers', '7', 'sujet.png'));
  expect(r.readableDirs).toEqual([join(dataDir, 'fichiers', '7')]);
  expect(r.prompt).toContain('===ENONCE===');
  expect(r.prompt).toContain('===CORRECTION===');
});

test('generate with a docx uses extractedText inline and adds no readableDir for it', () => {
  const r = buildRequest({ kind: 'generate', exercise: ex, attachments: [docx], instruction: 'détaille' }, { dataDir, model: null });
  expect(r.prompt).toContain('Texte du TD Word');
  expect(r.prompt).toContain('détaille');
  expect(r.readableDirs).toEqual([]);
  expect(r.prompt).not.toContain('===ENONCE===');
});

test('statementTranscription is preferred over statementText when present', () => {
  const r = buildRequest({
    kind: 'similar', exercise: { ...ex, statementTranscription: 'TRANSCRIPTION' }, attachments: [png], current: 'c',
  }, { dataDir, model: null });
  expect(r.prompt).toContain('TRANSCRIPTION');
  expect(r.prompt).not.toContain('Calculer ∫ ln x dx');
  expect(r.readableDirs).toEqual([]);
});

test('fix request asks only for ===REMPLACEMENT=== and contains the quote', () => {
  const r = buildRequest({ kind: 'fix', exercise: ex, attachments: [], current: 'c', quote: 'étape fausse', thread: [], instruction: null }, { dataDir, model: null });
  expect(r.prompt).toContain('===REMPLACEMENT===');
  expect(r.prompt).toContain('étape fausse');
});

test('check request lists answer files and makes their folder readable', () => {
  const ans = join(dataDir, 'fichiers', '7', 'reponses', 'copie.jpg');
  const r = buildRequest({ kind: 'check', exercise: ex, attachments: [], current: 'c', answerText: 'x = 2', answerFiles: [ans] }, { dataDir, model: null });
  expect(r.prompt).toContain(ans);
  expect(r.prompt).toContain('x = 2');
  expect(r.readableDirs).toEqual([join(dataDir, 'fichiers', '7', 'reponses')]);
});

test('model from ctx is forwarded', () => {
  const r = buildRequest({ kind: 'regenerate', exercise: ex, attachments: [], current: 'c', instruction: 'plus court' }, { dataDir, model: 'claude-sonnet-5-5' });
  expect(r.model).toBe('claude-sonnet-5-5');
  expect(r.prompt).toContain('plus court');
});

test('system prompt documents the three diagram formats', () => {
  expect(SYSTEM_PROMPT).toContain('```mermaid');
  expect(SYSTEM_PROMPT).toContain('```function-plot');
  expect(SYSTEM_PROMPT).toContain('```svg');
});
