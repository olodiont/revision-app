# App de révision avec commentaires — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web app where the user gets a Claude correction for an exercise, comments on highlighted passages (each comment is its own thread), asks for diagrams, fixes the correction with version history, and revises later from a library.

**Architecture:** A single Node/TypeScript package. A Hono server bound to `127.0.0.1` serves a Vite + React 19 front end, a JSON API and SSE streams. The data lives in one folder: a SQLite file (`node:sqlite`, FTS5), the original attachments, and a working directory for Claude calls. Claude is reached only through a `ClaudeProvider` interface. The only implementation for now spawns `claude -p` (the user's subscription). Comment anchoring and re-anchoring are pure functions in `shared/`, so both sides can use them.

**Tech Stack:** Node ≥ 22 (machine has 26.13), TypeScript, Hono + `@hono/node-server`, `node:sqlite`, Vite, React 19, Tailwind CSS v4 (`@tailwindcss/vite`), `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` + `rehype-highlight`, `mermaid`, `function-plot`, `dompurify`, `mammoth`, `diff-match-patch`, `diff`, Vitest (+ jsdom, @testing-library/react for web).

**Spec:** `docs/superpowers/specs/2026-11-19-revision-app-design.md`

## Global Constraints

- All UI copy in French.
- Server listens on `127.0.0.1` only.
- **No call to Claude without an explicit user action.** Only these POST endpoints may invoke the provider: generate, regenerate, comment message, diagram, propose-fix, similar, check-answer. No GET endpoint and no startup code may invoke it.
- Claude via `claude -p` only, through the `ClaudeProvider` interface (`server/claude/provider.ts`). No API key in this version.
- Claude Code tools: read-only access to the exercise's attachment folder. No writing, no shell, no web.
- Context sent per action follows spec §5.4 exactly. Other comment threads are never sent.
- Diagram formats: fenced ` ```mermaid `, ` ```function-plot ` (JSON for `function-plot`), ` ```svg ` (sanitized with DOMPurify). Store only the source.
- A comment is never deleted implicitly. If it cannot be re-anchored, its status becomes `detached`.
- One main document (the correction) per exercise. It is versioned. A version is never edited in place.
- Deleting an exercise deletes its versions, comments, messages, attachments and child exercises (after a UI confirmation).
- Data folder layout: `<dataDir>/revision.db`, `<dataDir>/fichiers/<exerciseId>/`, `<dataDir>/claude-cwd/`.
- Tests never call the real `claude` binary.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Claude CLI fails or stops mid-answer** (not installed, not logged in, usage limit, user closes the tab): the user sees a clear French message with a "Réessayer" button. A partial correction is never saved as a version, and the child process is killed. Tests: Task 5 (error mapping, abort kills the child) and Task 7 (a failed generation stores nothing).
2. **The same quote appears several times in the correction** (for example "= 0" or "On pose"): the comment anchors on the occurrence the user selected and stays on it after re-anchoring. Test: Task 4.
3. **Claude ignores the section markers or writes a broken diagram** (missing `===CORRECTION===`, invalid Mermaid, invalid function-plot JSON, malicious SVG): the whole text is used as the correction, and a broken diagram shows its source plus an error without breaking the page. Tests: Task 6 (parse fallback) and Task 9 (diagram fallback, SVG sanitizing).
4. **The data folder is deleted while the app is running** (the user empties storage): the next request recreates an empty database and folders without crashing. Test: Task 3.
5. **Unsupported or oversized attachment** (`.pptx`, HEIC photo, a 200 MB PDF), or a corrupt `.docx`: unsupported or oversized files are refused with a French message. A failed docx conversion keeps the file and stores no extracted text. The exercise is still created. Test: Task 3.

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html
scripts/lancer-revision.cmd          Windows launcher: npm start + open browser
shared/
  types.ts                           DTOs shared by server and web
  anchor.ts                          createAnchor, reanchor, applyReplacement
server/
  index.ts                           boot: config → db → app → listen 127.0.0.1
  config.ts                          app config (data dir, model, port) load/save
  app.ts                             createApp(deps) → Hono app (all routes mounted)
  db/schema.ts                       migrate(db)
  db/repo.ts                         all SQL access (library, exercises, versions, comments, messages)
  db/search.ts                       FTS5 index maintenance + search
  files/storage.ts                   data-dir layout, ensureDataDir, attachments, folder size, openInExplorer
  files/docx.ts                      docxToText
  claude/provider.ts                 ClaudeProvider interface + event types
  claude/cliProvider.ts              spawn `claude -p`, parse stream-json, map errors
  claude/fakeProvider.ts             scripted provider for tests
  claude/prompts.ts                  system prompt + buildRequest(action)
  claude/sections.ts                 parseSections
  routes/library.ts                  subjects/chapters/exercises CRUD + search
  routes/attachments.ts              upload/serve attachments
  routes/comments.ts                 comment CRUD/status (no AI)
  routes/ai.ts                       all provider-invoking endpoints (SSE)
  routes/storage.ts                  storage info, open folders, settings
  routes/export.ts                   Markdown export
  export/markdown.ts                 exerciseToMarkdown, subjectToMarkdownBundle
  sse.ts                             SSE helpers for streaming provider events
web/
  main.tsx, App.tsx, index.css
  api.ts                             fetch helpers + streamAi (POST SSE reader)
  components/Library.tsx             tree, CRUD, search box
  components/ExerciseView.tsx        statement + correction + comments layout
  components/NewExerciseForm.tsx     text + file upload
  components/Markdown.tsx            renderer with source offsets, math, code, diagrams
  components/diagrams/{Mermaid,FunctionPlot,SafeSvg,DiagramError}.tsx
  components/CommentsPanel.tsx       open/resolved/detached lists, alignment
  components/CommentThread.tsx       messages, reply box, "Schéma ici", "Corriger la correction"
  components/SelectionPopover.tsx    "Commenter" button
  components/VersionBar.tsx          version selector, regenerate, diff modal
  components/RevisionBar.tsx         Me tester / Révéler / Exo similaire / Vérifie ma réponse
  components/StoragePage.tsx         paths, sizes, open buttons, settings, privacy note
  lib/rehypeSourceOffsets.ts         rehype plugin: data-s / data-block-* attributes
  lib/selection.ts                   domSelectionToSourceRange
  lib/steps.ts                       splitIntoSteps (step-by-step reveal)
tests/  mirrors server/, shared/, web/lib/
```

---

### Task 1: Scaffold, config, server boot, launcher

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `server/config.ts`, `server/app.ts`, `server/index.ts`, `web/main.tsx`, `web/App.tsx`, `web/index.css`, `scripts/lancer-revision.cmd`
- Test: `tests/server/config.test.ts`, `tests/server/app.test.ts`

**Interfaces:**
- Produces:
  - `interface AppConfig { dataDir: string; model: string | null; port: number }`
  - `loadConfig(configPath: string): AppConfig` creates the file with defaults if it is missing. Defaults: `dataDir = <home>/Documents/Revision/revision-data`, `model = null`, `port = 5317`.
  - `saveConfig(configPath: string, cfg: AppConfig): void`
  - `defaultConfigPath(): string` returns `%APPDATA%/revision-app/config.json`, or `~/.config/revision-app/config.json` when not on Windows.
  - `createApp(deps: AppDeps): Hono` with `interface AppDeps { db: DatabaseSync; config: AppConfig; configPath: string; provider: ClaudeProvider; openPath: (p: string) => void }`. Later tasks add route modules to it. For this task it mounts only `GET /api/health` → `{ ok: true }`. Tasks 2 and 5 define the `db` and `provider` types. In this task they are typed `unknown` and tightened later.

- [ ] **Step 1: Init repo and package**

Run `git init`. Create `package.json` (`"type": "module"`) with these scripts:
- `dev`: concurrently runs `tsx watch server/index.ts` and `vite`.
- `build`: `vite build`.
- `start`: `npm run build && tsx server/index.ts`.
- `test`: `vitest run`.

Install the Tech Stack dependencies plus `tsx`, `concurrently`, `vitest`, `jsdom`, `@testing-library/react`, `@types/*`. Vite proxies `/api` to the server port in dev. In production, the server serves `dist/` statically.

- [ ] **Step 2: Write failing tests**

```ts
// tests/server/config.test.ts
test('loadConfig creates defaults when file missing', () => {
  const p = join(tmp, 'config.json');
  const cfg = loadConfig(p);
  expect(cfg.port).toBe(5317);
  expect(cfg.model).toBeNull();
  expect(cfg.dataDir).toMatch(/revision-data$/);
  expect(existsSync(p)).toBe(true);
});
test('saveConfig then loadConfig round-trips', () => { /* dataDir:'X', model:'claude-opus-5-5' */ });

// tests/server/app.test.ts
test('GET /api/health', async () => {
  const res = await createApp(fakeDeps()).request('/api/health');
  expect(await res.json()).toEqual({ ok: true });
});
```

- [ ] **Step 3: Run `npx vitest run tests/server` and check that it fails** (modules missing)
- [ ] **Step 4: Implement `config.ts`, `app.ts` and `index.ts`.** `index.ts` loads the config and calls `serve({ fetch: app.fetch, hostname: '127.0.0.1', port })`. `web/App.tsx` renders "Révision" so the page is not blank.
- [ ] **Step 5: Write `scripts/lancer-revision.cmd`.** It runs `cd /d "%~dp0.."`, then `start "" http://127.0.0.1:5317`, then `npm start`.
- [ ] **Step 6: Run `npm test` and check that all tests pass. Run `npm start` and check that `http://127.0.0.1:5317/api/health` returns `{"ok":true}`.**
- [ ] **Step 7: Commit** `chore: scaffold app, config and server boot`

---

### Task 2: Database schema, repository, search

**Files:**
- Create: `shared/types.ts`, `server/db/schema.ts`, `server/db/repo.ts`, `server/db/search.ts`
- Test: `tests/server/repo.test.ts`, `tests/server/search.test.ts`

**Interfaces:**
- Produces (`shared/types.ts`):

```ts
export type Id = number;
export interface Subject { id: Id; name: string; position: number }
export interface Chapter { id: Id; subjectId: Id; name: string; position: number }
export interface Exercise { id: Id; chapterId: Id; parentId: Id | null; title: string;
  statementText: string; statementTranscription: string | null; createdAt: string }
export interface Attachment { id: Id; exerciseId: Id; fileName: string; mime: string;
  relPath: string; size: number; extractedText: string | null }
export type VersionReason = 'initial' | 'fix' | 'regenerate';
export interface CorrectionVersion { id: Id; exerciseId: Id; number: number; markdown: string;
  reason: VersionReason; triggerCommentId: Id | null; instruction: string | null; createdAt: string }
export interface Anchor { exact: string; prefix: string; suffix: string; start: number; end: number; kind: 'text' | 'block' }
export type CommentStatus = 'open' | 'resolved' | 'detached';
export type CommentKind = 'passage' | 'check-answer';
export interface Comment { id: Id; exerciseId: Id; versionId: Id; anchor: Anchor | null;
  status: CommentStatus; changed: boolean; kind: CommentKind; createdAt: string }
export interface Message { id: Id; commentId: Id; role: 'user' | 'assistant'; content: string; createdAt: string }
export interface LibraryTree { subjects: (Subject & { chapters: (Chapter & { exercises: (Pick<Exercise,'id'|'title'|'parentId'>)[] })[] })[] }
export interface SearchHit { exerciseId: Id; title: string; snippet: string; source: 'title'|'statement'|'correction'|'comment' }
```

- Produces (`server/db/schema.ts`): `openDb(file: string): DatabaseSync`. It opens the file, enables `PRAGMA foreign_keys = ON`, and calls `migrate`. `migrate(db: DatabaseSync): void` is idempotent. It creates the tables, with `ON DELETE CASCADE` on every child foreign key (including `exercises.parent_id`), plus the FTS5 table `search_index(exercise_id UNINDEXED, source UNINDEXED, title, body)`.
- Produces (`server/db/repo.ts`). Each function takes `db` as its first argument:
  - `createSubject(db, name)`, `renameSubject(db, id, name)`, `deleteSubject(db, id)`
  - `createChapter(db, subjectId, name)`, `renameChapter`, `moveChapter(db, id, subjectId)`, `deleteChapter`
  - `createExercise(db, { chapterId, title, statementText, parentId? }) → Exercise`, `getExercise(db, id) → Exercise | null`, `updateExercise(db, id, patch: Partial<Pick<Exercise,'title'|'chapterId'|'statementTranscription'>>)`, `deleteExercise(db, id)`
  - `addAttachment(db, a: Omit<Attachment,'id'>) → Attachment`, `listAttachments(db, exerciseId)`
  - `addVersion(db, v: Omit<CorrectionVersion,'id'|'number'|'createdAt'>) → CorrectionVersion` (`number` = previous max + 1), `listVersions(db, exerciseId)`, `currentVersion(db, exerciseId) → CorrectionVersion | null`
  - `createComment(db, c: Omit<Comment,'id'|'createdAt'|'changed'|'status'>) → Comment`, `updateComment(db, id, patch: Partial<Pick<Comment,'anchor'|'status'|'changed'|'versionId'>>)`, `listComments(db, exerciseId)`, `getComment(db, id)`
  - `addMessage(db, commentId, role, content) → Message`, `listMessages(db, commentId)`
  - `getLibraryTree(db) → LibraryTree`
- Produces (`server/db/search.ts`): `reindexExercise(db, exerciseId)` rebuilds that exercise's rows from its title, statement, transcription, current version and all its messages. `search(db, query) → SearchHit[]` returns at most 50 hits and uses `snippet()`. Repo functions that change indexed content call `reindexExercise`.

- [ ] **Step 1: Write failing tests**

```ts
test('deleteExercise cascades to versions, comments, messages, attachments rows and child exercises', ...)
test('addVersion numbers 1,2,3 per exercise and currentVersion returns the highest', ...)
test('getLibraryTree nests subjects > chapters > exercises with children carrying parentId', ...)
test('migrate is idempotent (calling twice does not throw)', ...)
test('search finds a word from the current correction and from a comment message, not from an old version', ...)
test('search query with FTS syntax characters like "u = ln(x)" does not throw', ...)
```

- [ ] **Step 2: Run `npx vitest run tests/server/repo.test.ts tests/server/search.test.ts` and check that it fails**
- [ ] **Step 3: Implement `schema.ts`, `repo.ts` and `search.ts`.** Store `anchor` as JSON text. Escape the user's query for FTS by quoting each term (`"term"`) before calling `MATCH`.
- [ ] **Step 4: Run the tests and check that they pass**
- [ ] **Step 5: Commit** `feat: sqlite schema, repository and full-text search`

---

### Task 3: Data folder, attachments, docx, folder actions

**Files:**
- Create: `server/files/storage.ts`, `server/files/docx.ts`, `server/routes/attachments.ts`, `server/routes/library.ts`
- Modify: `server/app.ts` (mount routes; ensure data dir per request), `server/index.ts`
- Test: `tests/server/storage.test.ts`, `tests/server/library-routes.test.ts`

**Interfaces:**
- Consumes: the repo from Task 2.
- Produces:
  - `dataPaths(dataDir) → { db: string; files: string; claudeCwd: string }`
  - `ensureDataDir(dataDir): void` creates the 3 locations if they are missing.
  - `ACCEPTED_TYPES = { 'image/png','image/jpeg','image/webp','image/gif','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown' }`, `MAX_FILE_BYTES = 30 * 1024 * 1024`
  - `saveAttachment(dataDir, exerciseId, fileName, mime, bytes: Uint8Array) → { relPath: string; size: number }`. It throws `AttachmentError('type' | 'size')`.
  - `deleteExerciseFiles(dataDir, exerciseId)`
  - `folderSize(path) → number` (bytes, recursive; 0 when the folder is missing)
  - `openInExplorer(path)` spawns `explorer.exe <path>` detached. It is injected as `deps.openPath` so tests can fake it.
  - `docxToText(bytes) → Promise<string | null>` returns `null` on failure.
  - DB lifecycle: `getDb(deps)` returns an open DB. If `revision.db` no longer exists on disk, it closes the old handle, runs `ensureDataDir` and reopens with `openDb`. Every route uses `getDb(deps)` instead of `deps.db`.
  - Routes:
    - `GET /api/library`
    - `POST/PATCH/DELETE /api/subjects[/:id]` and `/api/chapters[/:id]`
    - `POST /api/exercises` (multipart: `chapterId`, `title`, `statementText`, `files[]`) → `Exercise`. Rejected files come back in `{ exercise, rejected: { fileName, reason: 'type'|'size' }[] }`.
    - `GET/PATCH/DELETE /api/exercises/:id`. GET returns `{ exercise, attachments, versions, comments, messagesByComment, children }`.
    - `GET /api/attachments/:id` streams the file.
    - `GET /api/search?q=`

- [ ] **Step 1: Write failing tests**

```ts
test('POST /api/exercises with a .pptx keeps the exercise and reports rejected type', ...)
test('POST /api/exercises with a file over MAX_FILE_BYTES reports rejected size', ...)
test('corrupt .docx is stored with extractedText null and exercise still created', ...)
test('valid .docx stores extractedText containing its paragraph text', ...)  // fixture tests/fixtures/simple.docx
test('DELETE /api/exercises/:id removes fichiers/<id> folder', ...)
test('after rm -rf dataDir, GET /api/library returns empty tree with 200 and recreates revision.db', ...)
test('folderSize sums nested files and returns 0 for missing folder', ...)
```

- [ ] **Step 2: Run the tests and check that they fail**
- [ ] **Step 3: Implement.** Detect the MIME type from the file extension when the browser sends `application/octet-stream`.
- [ ] **Step 4: Run the tests and check that they pass**
- [ ] **Step 5: Commit** `feat: data folder, attachments, docx extraction, library routes`

---

### Task 4: Anchoring and re-anchoring (pure)

**Files:**
- Create: `shared/anchor.ts`
- Test: `tests/shared/anchor.test.ts`

**Interfaces:**
- Produces:
  - `CONTEXT_CHARS = 32`
  - `createAnchor(source: string, start: number, end: number, kind: 'text'|'block') → Anchor` fills `exact` and up to 32 characters of `prefix`/`suffix`.
  - `reanchor(anchor: Anchor, newSource: string) → { anchor: Anchor; status: 'exact' | 'fuzzy' | 'lost' }`
  - `applyReplacement(source: string, start: number, end: number, replacement: string) → string`
  - `isInsideRange(anchor: Anchor, start: number, end: number) → boolean` returns true when the anchor overlaps the range.

`reanchor` algorithm (the tests do not fully determine it):
1. Find every occurrence of `exact` in `newSource`. If there is exactly one, return it with status `exact`. If there are several, score each one by the length of the common suffix of its preceding text with `prefix`, plus the length of the common prefix of its following text with `suffix`. Break ties by distance to the old `start`. Status `exact`.
2. If there is none, use `diff-match-patch` `match_main(newSource, exact.slice(0, 32), oldStartClamped)` with `Match_Threshold = 0.4`. If it finds a position, extend the match to roughly `exact.length` by aligning with `diff_main` on that window. Status `fuzzy`.
3. Otherwise status `lost`. Callers map statuses as follows: `exact` → unchanged, `fuzzy` → `changed = true`, `lost` → `status = 'detached'`.

- [ ] **Step 1: Write failing tests**

```ts
test('createAnchor takes 32 chars of context each side, clipped at bounds', ...)
test('reanchor returns exact when text unchanged', ...)
test('reanchor picks the right occurrence of a repeated quote using prefix/suffix', () => {
  const src = 'A: on pose u = 0.\nB: on pose u = 0.\n';
  const a = createAnchor(src, src.lastIndexOf('on pose'), src.lastIndexOf('on pose') + 7, 'text');
  const moved = 'Intro.\n' + src;
  const r = reanchor(a, moved);
  expect(r.status).toBe('exact');
  expect(r.anchor.start).toBe(moved.lastIndexOf('on pose'));
});
test('reanchor follows text that shifted after an insertion earlier in the source', ...)
test('reanchor returns fuzzy when the quote was lightly edited ("u = ln x" -> "u = ln(x)")', ...)
test('reanchor returns lost when the passage was removed entirely', ...)
test('applyReplacement replaces exactly [start,end)', ...)
test('isInsideRange detects overlap and non-overlap at boundaries', ...)
```

- [ ] **Step 2: Run `npx vitest run tests/shared/anchor.test.ts` and check that it fails**
- [ ] **Step 3: Implement `shared/anchor.ts`**
- [ ] **Step 4: Run the tests and check that they pass**
- [ ] **Step 5: Commit** `feat: comment anchoring and re-anchoring`

---

### Task 5: Claude provider (CLI)

**Files:**
- Create: `server/claude/provider.ts`, `server/claude/cliProvider.ts`, `server/claude/fakeProvider.ts`
- Test: `tests/server/cliProvider.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ClaudeRequest { systemPrompt: string; prompt: string; readableDirs: string[]; model: string | null; signal?: AbortSignal }
export type ClaudeErrorCode = 'not_installed' | 'not_logged_in' | 'usage_limit' | 'interrupted' | 'unknown';
export type ClaudeEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; fullText: string }
  | { type: 'error'; code: ClaudeErrorCode; message: string };
export interface ClaudeProvider { send(req: ClaudeRequest): AsyncIterable<ClaudeEvent> }
export const ERROR_MESSAGES_FR: Record<ClaudeErrorCode, string>;
```

  - `createCliProvider(opts: { cwd: string; command?: string; spawnFn?: typeof spawn }) → ClaudeProvider`
  - `createFakeProvider(script: (req: ClaudeRequest) => ClaudeEvent[]) → ClaudeProvider & { calls: ClaudeRequest[] }`

French messages (fixed copy):
- `not_installed`: "Claude Code n'est pas installé ou introuvable. Installe-le puis relance l'app."
- `not_logged_in`: "Claude Code n'est pas connecté à ton compte. Lance `claude` dans un terminal pour te connecter."
- `usage_limit`: "Limite d'usage de ton abonnement atteinte. Réessaie plus tard."
- `interrupted`: "La réponse a été interrompue."
- `unknown`: "Erreur de Claude Code."

- [ ] **Step 1: Check the installed CLI flags.** The machine currently has no `claude` on PATH (see the Prerequisite in Task 14). Once it is installed, run `claude --help`. Confirm the names of these flags and record the confirmed ones in a comment at the top of `cliProvider.ts`:
  - `-p`
  - `--output-format stream-json` (with `--verbose`)
  - `--include-partial-messages`
  - `--append-system-prompt`
  - `--model`
  - `--add-dir`
  - `--tools` or `--allowedTools`
  - `--no-session-persistence`

  If a flag is missing, drop it. One exception: if no flag can restrict tools, use `--disallowedTools Bash Write Edit WebFetch WebSearch` instead.
- [ ] **Step 2: Write failing tests** with a fake `spawnFn` that returns an EventEmitter child whose stdout emits scripted lines:

```ts
test('spawns claude with -p, stream-json, appended system prompt, Read-only tools, add-dir per readableDir, model when set; prompt written to stdin', ...)
test('omits --model when model is null', ...)
test('text_delta stream events yield text events in order, result success yields done with full text', ...)
test('assistant message without partial deltas still yields its text', ...)
test('ENOENT on spawn yields error not_installed', ...)
test('result is_error with text matching /log ?in|authenticat/i yields not_logged_in', ...)
test('result is_error with text matching /limit|quota|rate/i yields usage_limit', ...)
test('non-zero exit without result yields error unknown with stderr tail', ...)
test('aborting the signal kills the child and yields interrupted', ...)
test('malformed JSON line is skipped, not fatal', ...)
```

- [ ] **Step 3: Run the tests and check that they fail**
- [ ] **Step 4: Implement.** Parse stdout line by line:
  - `stream_event` whose `event.type === 'content_block_delta'` and `delta.type === 'text_delta'` → a `text` event.
  - `assistant` messages: count their text only if no delta arrived for that message.
  - `result` → `done`, or an error based on `is_error`.

  Spawn with `cwd = opts.cwd`, `shell: false`, `windowsHide: true`. On Windows, try `claude.cmd` when `claude` raises ENOENT.
- [ ] **Step 5: Run the tests and check that they pass**
- [ ] **Step 6: Commit** `feat: claude CLI provider with streaming and error mapping`

---

### Task 6: Prompts and structured output

**Files:**
- Create: `server/claude/prompts.ts`, `server/claude/sections.ts`
- Test: `tests/server/prompts.test.ts`, `tests/server/sections.test.ts`

**Interfaces:**
- Consumes: `ClaudeRequest` (Task 5), types (Task 2).
- Produces:

```ts
export type AiAction =
  | { kind: 'generate'; exercise: Exercise; attachments: Attachment[]; instruction: string | null }
  | { kind: 'regenerate'; exercise: Exercise; attachments: Attachment[]; current: string; instruction: string }
  | { kind: 'comment'; exercise: Exercise; attachments: Attachment[]; current: string; quote: string; thread: Message[]; question: string }
  | { kind: 'diagram'; exercise: Exercise; attachments: Attachment[]; current: string; quote: string; thread: Message[]; request: string | null }
  | { kind: 'fix'; exercise: Exercise; attachments: Attachment[]; current: string; quote: string; thread: Message[]; instruction: string | null }
  | { kind: 'similar'; exercise: Exercise; attachments: Attachment[]; current: string }
  | { kind: 'check'; exercise: Exercise; attachments: Attachment[]; current: string; answerText: string | null; answerFiles: string[] };
export function buildRequest(action: AiAction, ctx: { dataDir: string; model: string | null }): ClaudeRequest;
export function parseSections(text: string): Record<string, string>;  // markers: a line exactly "===NAME==="
export const SYSTEM_PROMPT: string;
```

Fixed parts of `SYSTEM_PROMPT` (in French, written by the builder, must contain):
- Role: a patient tutor. Answer in French. Markdown with `$…$` / `$$…$$` math and fenced code.
- The three diagram formats from spec §5.5, with one short example each. Pick the lightest format that works. The ` ```function-plot ` block contains JSON accepted by `functionPlot()` with no `target` key.
- The output contract per action:
  - `generate`: `===CORRECTION===` and, when attachments are images or PDF, `===ENONCE===` (a Markdown transcription of the statement).
  - `fix`: only `===REMPLACEMENT===` (the new text of the quoted passage).
  - `similar`: `===ENONCE===` and `===CORRECTION===`.
  - `comment`, `diagram`, `check`, `regenerate`: plain answer text. `regenerate` uses `===CORRECTION===`.

Context rules (spec §5.4), as tests:
- The statement is `statementTranscription ?? statementText`, plus each attachment's `extractedText`.
- Image and PDF attachment absolute paths are listed in the prompt, and their folder goes into `readableDirs`.
- `answerFiles` folders also go into `readableDirs`.

- [ ] **Step 1: Write failing tests**

```ts
test('comment request contains statement, current correction, quote, this thread only, question', ...)
test('comment request never contains text from another thread', ...)          // pass two threads' content; assert absence
test('generate with an image attachment lists its absolute path and adds fichiers/<id> to readableDirs', ...)
test('generate with a docx uses extractedText inline and adds no readableDir for it', ...)
test('statementTranscription is preferred over statementText when present', ...)
test('model from ctx is forwarded', ...)
test('parseSections splits on ===NAME=== lines and trims', ...)
test('parseSections returns {} when no marker present', ...)
```

- [ ] **Step 2: Run the tests and check that they fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the tests and check that they pass**
- [ ] **Step 5: Commit** `feat: prompt builder and section parsing`

---

### Task 7: AI routes (SSE) and version logic

**Files:**
- Create: `server/sse.ts`, `server/routes/ai.ts`, `server/routes/comments.ts`
- Modify: `server/app.ts`
- Test: `tests/server/ai-routes.test.ts`, `tests/server/comments-routes.test.ts`

**Interfaces:**
- Consumes: `buildRequest`, `parseSections`, the repo, `createAnchor`, `reanchor`, `applyReplacement`, `isInsideRange`, `ClaudeProvider`.
- Produces:
  - SSE protocol for every AI endpoint: `event: delta` `{text}`*, then exactly one of `event: done` `{...payload}` or `event: error` `{code, message}`. The provider is called with an `AbortSignal` tied to the request: when the client disconnects, the request aborts.
  - Endpoints and their `done` payloads:
    - `POST /api/exercises/:id/generate` `{instruction?}` → `{ version: CorrectionVersion, exercise: Exercise }`. Saves `===CORRECTION===` (or the whole text when the marker is missing) as a version with reason `initial`. Saves `===ENONCE===` into `statementTranscription`. Saves nothing on error.
    - `POST /api/exercises/:id/regenerate` `{instruction}` → `{ proposal: string }`. Does not save.
    - `POST /api/exercises/:id/regenerate/accept` `{proposal, instruction}` (plain JSON, no AI) → `{ version, comments }`. New version with reason `regenerate`. Re-anchors all comments.
    - `POST /api/comments` `{exerciseId, anchor, question}` (SSE) → `{ comment, messages }`. Creates the comment on the current version, saves the user message, then the assistant message when the stream finishes. On error, keeps the comment and the user message, saves no assistant message.
    - `POST /api/comments/:id/messages` `{question}` (SSE) → `{ messages }`
    - `POST /api/comments/:id/diagram` `{request?}` (SSE) → `{ messages }`
    - `POST /api/comments/:id/fix` `{instruction?}` (SSE) → `{ proposal: { start, end, before, after } }`, where `before` is the current text at the anchor and `after` is `===REMPLACEMENT===`. Does not save.
    - `POST /api/comments/:id/fix/accept` `{start, end, after}` (JSON) → `{ version, comments }`. Applies the replacement and creates a version with reason `fix` and `triggerCommentId`. The trigger comment becomes `resolved` and moves to the new anchor. Each other comment: re-anchor; if it overlaps `[start, start+after.length)` or the status is `fuzzy`, set `changed = true`; `lost` → `detached`. Its `versionId` is updated.
    - `POST /api/exercises/:id/similar` (SSE) → `{ exercise }`. Creates a child exercise (same chapter, `parentId = id`, title `"<titre> — variante N"`) with a version from `===CORRECTION===`.
    - `POST /api/exercises/:id/check` (multipart: `answerText?`, `files[]`, SSE) → `{ comment, messages }`. Saves the files under `fichiers/<id>/reponses/`. Creates a comment with kind `check-answer` and anchor `null`.
  - Non-AI comment routes: `PATCH /api/comments/:id` `{status: 'open'|'resolved'}`, `DELETE /api/comments/:id` (explicit user deletion only).

- [ ] **Step 1: Write failing tests** using `createFakeProvider` and an in-memory DB plus a temp data dir:

```ts
test('generate stores version 1 from ===CORRECTION=== and transcription from ===ENONCE===', ...)
test('generate without markers stores whole text as correction', ...)
test('generate that ends in error stores no version and streams error event with French message', ...)
test('comment creation saves user + assistant messages; provider received only this thread', ...)
test('fix/accept creates version 2, resolves trigger, marks overlapping comment changed, detaches comment whose text vanished, keeps unrelated comment unchanged', ...)
test('regenerate returns a proposal and stores nothing until accept', ...)
test('similar creates a child exercise with parentId and its own version 1', ...)
test('no GET endpoint calls the provider', async () => {
  // hit GET /api/library, /api/exercises/:id, /api/search?q=x, /api/storage
  expect(fake.calls).toHaveLength(0);
});
test('client abort propagates to provider signal', ...)
```

- [ ] **Step 2: Run the tests and check that they fail**
- [ ] **Step 3: Implement `sse.ts` (`streamProvider(c, request, onDone)`) and the routes.** After each mutation, call `reindexExercise`.
- [ ] **Step 4: Run the tests and check that they pass**
- [ ] **Step 5: Commit** `feat: AI endpoints with streaming, versioning and re-anchoring`

---

### Task 8: Web shell, library, new exercise

**Files:**
- Create: `web/api.ts`, `web/components/Library.tsx`, `web/components/NewExerciseForm.tsx`, `web/components/ExerciseView.tsx` (skeleton)
- Modify: `web/App.tsx`, `web/index.css`
- Test: `tests/web/api.test.ts`

**Interfaces:**
- Consumes: the REST/SSE routes from Tasks 3 and 7.
- Produces:
  - `api.get<T>(path)`, `api.send<T>(method, path, body | FormData)`
  - `streamAi<T>(path: string, body: unknown | FormData, onDelta: (t: string) => void, signal?: AbortSignal) → Promise<T>`. It POSTs, reads the SSE from `response.body`, resolves on `done`, and rejects with `AiError { code, message }` on `error`.
  - App routing via the hash: `#/exo/:id`, `#/stockage`, `#/` (home).

Layout as in spec §6.1:
- Left column: `Library` with the tree, inline create/rename/delete (delete asks `confirm()` in French), drag-free "Déplacer" via a select, and a search box with debounced `/api/search` results.
- Centre: `ExerciseView`.
- Right column: the comments panel (Task 10).

`NewExerciseForm` has a title, chapter, statement textarea and multi-file input. It shows the rejected files returned by the server.

- [ ] **Step 1: Write failing test** `streamAi parses delta/done across chunk boundaries and rejects on error event` (mock `fetch` with a ReadableStream that splits one event across two chunks)
- [ ] **Step 2: Run `npx vitest run tests/web/api.test.ts` and check that it fails**
- [ ] **Step 3: Implement `api.ts` and the components.** Use Tailwind. Define semantic color tokens in `index.css` `@theme`.
- [ ] **Step 4: Run the tests and check that they pass. With `npm run dev`, create a subject, a chapter and an exercise with a photo, and check that it appears in the tree.**
- [ ] **Step 5: Commit** `feat: web shell, library tree and exercise creation`

---

### Task 9: Markdown renderer with source offsets and diagrams

**Files:**
- Create: `web/components/Markdown.tsx`, `web/lib/rehypeSourceOffsets.ts`, `web/components/diagrams/Mermaid.tsx`, `FunctionPlot.tsx`, `SafeSvg.tsx`, `DiagramError.tsx`
- Test: `tests/web/rehypeSourceOffsets.test.ts`, `tests/web/diagrams.test.tsx`

**Interfaces:**
- Produces:
  - `<Markdown source={string} highlights?={{start,end,commentId,active}[]} onBlockClick?={(range:{start,end}) => void} />` renders GFM, KaTeX math, highlighted code, and diagrams for code fences tagged `mermaid` / `function-plot` / `svg`. Comment highlights are drawn as `<mark data-comment-id>` over the text spans of the given source ranges.
  - `rehypeSourceOffsets()`: a rehype plugin.
    - Wraps every text node that has a position in `<span data-s="{startOffset}">`.
    - Marks math nodes (inline and display), diagram fences and code blocks with `data-block-start` / `data-block-end` (source offsets of the whole construct).
    - For code blocks, adds `data-code-start` = the source offset of the first character of the code content (after the opening fence line).
  - `<DiagramError source error />` shows the source in a `<pre>` plus "Ce schéma n'a pas pu être dessiné : …".
  - `SafeSvg` sanitizes with `DOMPurify.sanitize(src, { USE_PROFILES: { svg: true, svgFilters: true } })`.

- [ ] **Step 1: Write failing tests**

```ts
test('text spans carry data-s equal to their markdown source offset (inside **bold** too)', ...)
test('inline math $x^2$ element carries data-block-start/end covering "$x^2$"', ...)
test('code fence carries data-code-start pointing just after the opening fence line', ...)
test('invalid mermaid renders DiagramError with the source, page does not throw', ...)
test('invalid function-plot JSON renders DiagramError', ...)
test('SafeSvg strips <script> and onload attributes', ...)
```

- [ ] **Step 2: Run the tests and check that they fail**
- [ ] **Step 3: Implement.** Configure Mermaid with `startOnLoad: false` and `securityLevel: 'strict'`, and render with `mermaid.render(id, src)` inside an effect. FunctionPlot: `JSON.parse` the source, then call `functionPlot({ ...spec, target: ref })` inside a try/catch.
- [ ] **Step 4: Run the tests and check that they pass**
- [ ] **Step 5: Commit** `feat: markdown renderer with source offsets, math, code and diagrams`

---

### Task 10: Selection, comments panel, threads

**Files:**
- Create: `web/lib/selection.ts`, `web/components/SelectionPopover.tsx`, `web/components/CommentsPanel.tsx`, `web/components/CommentThread.tsx`
- Modify: `web/components/ExerciseView.tsx`
- Test: `tests/web/selection.test.ts`

**Interfaces:**
- Consumes: `Markdown` (Task 9), `createAnchor` (Task 4), `streamAi` (Task 8), comment endpoints (Task 7).
- Produces: `domSelectionToSourceRange(sel: Selection, container: HTMLElement) → { start: number; end: number; kind: 'text' | 'block' } | null`

Algorithm:
- For each selection endpoint:
  - If it is inside a `[data-block-start]` element that is not a code block, snap to that block: use `start` for the anchor end and `end` for the focus end, and the result has `kind: 'block'`.
  - If it is inside a code block, the offset is `data-code-start` plus the text length before the point within that `<code>` element.
  - Otherwise, the offset is the nearest ancestor `[data-s]` value plus the offset inside the text node.
- Return `null` if the endpoints are outside `container`.
- Clicking a block (math or diagram) gives its whole range through `onBlockClick`.

UI:
- `SelectionPopover` shows a "Commenter" button near the selection. It opens a new-thread box (question textarea), then `POST /api/comments` with `createAnchor(source, start, end, kind)`.
- `CommentsPanel`:
  - Open comments are sorted by `anchor.start` and vertically aligned to the `top` of their `<mark>`, or stacked when they would overlap.
  - Resolved comments are collapsed under "✓ N résolus".
  - Detached comments are listed under "Commentaires détachés" with their old quote.
  - A comment with `changed` shows the label "passage modifié".
  - `check-answer` threads appear under "Mes réponses vérifiées".
- `CommentThread` shows the messages rendered with `<Markdown>`, streams the reply in live, and has:
  - a reply box;
  - "Schéma ici";
  - "Marquer résolu" / "Rouvrir";
  - "Corriger la correction" (Task 11);
  - "Supprimer" with confirmation.

  Errors show `message` and a "Réessayer" button that resends the same request.
- Clicking a comment highlights its `<mark>`, and the reverse works too.

- [ ] **Step 1: Write failing tests** in jsdom, rendering `<Markdown>` and building `Range`s programmatically:

```ts
test('selection inside plain text maps to exact source offsets', ...)
test('selection inside **bold** maps to offsets excluding the ** markers', ...)
test('selection starting in text and ending inside $$…$$ snaps end to block end, kind block', ...)
test('selection inside a highlighted code line maps through data-code-start', ...)
test('selection outside container returns null', ...)
```

- [ ] **Step 2: Run the tests and check that they fail**
- [ ] **Step 3: Implement `selection.ts` and the components**
- [ ] **Step 4: Run the tests and check that they pass. Manual check with `npm run dev` and the real CLI (Task 14 prerequisite): comment a sentence, ask a question, get the streamed answer, "Schéma ici", resolve.**
- [ ] **Step 5: Commit** `feat: text selection comments with threaded answers`

---

### Task 11: Correction versions — fix, regenerate, history

**Files:**
- Create: `web/components/VersionBar.tsx`, `web/components/DiffView.tsx`
- Modify: `web/components/CommentThread.tsx`, `web/components/ExerciseView.tsx`

**Interfaces:**
- Consumes: the fix, fix/accept, regenerate and regenerate/accept endpoints (Task 7). `diffWords` from `diff`.
- Produces: `<DiffView before after />` shows word-level removed/added markup.

Behaviour:
- In a thread, "Corriger la correction" streams `/fix`, then opens a modal with `DiffView(before, after)` and the buttons "Accepter" / "Refuser". Accept calls `/fix/accept` and refreshes the exercise.
- On the correction, the `VersionBar` has a "Refaire" button. It asks for an instruction (placeholder "ex : plus détaillée, explique plutôt que corriger"), streams `/regenerate`, shows a full-text `DiffView` modal, and Accept calls `/regenerate/accept`.
- A version selector "v1 … vN" shows an older version read-only, with the label "Version N — {raison}, {date}" and, for fix versions, "suite au commentaire « {quote} »". Comments are hidden on old versions.
- "Générer la correction" (with an optional instruction) appears when the exercise has no version yet.

- [ ] **Step 1: Write failing test** `tests/web/diffview.test.tsx`: `DiffView marks removed and added words`
- [ ] **Step 2: Run the test and check that it fails**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the tests and check that they pass. Manual check: fix a passage, check that v2 shows, the trigger comment is resolved, and another comment on the same passage shows "passage modifié".**
- [ ] **Step 5: Commit** `feat: correction fix, regenerate and version history UI`

---

### Task 12: Revision mode, similar exercise, check my answer

**Files:**
- Create: `web/components/RevisionBar.tsx`, `web/lib/steps.ts`
- Modify: `web/components/ExerciseView.tsx`, `web/components/Library.tsx`
- Test: `tests/web/steps.test.ts`

**Interfaces:**
- Produces: `splitIntoSteps(markdown: string) → string[]`. It splits on headings (`#`–`####`). When there is no heading, it splits on blank-line paragraphs. Fenced code, `$$` blocks and diagram fences are never split.

Behaviour:
- "Me tester" (no network call) hides the correction and the comments panel.
- "Révéler tout" restores them. "Étape suivante" reveals `splitIntoSteps` chunks one at a time.
- Opening an exercise with `parentId !== null` starts in "Me tester".
- "Exo similaire" calls `/similar` (streamed text shown in a modal while it generates), then navigates to the new child. The library shows children indented under their parent with the prefix "↳".
- "Vérifie ma réponse" opens a textarea plus a file input, calls `/check`, and the resulting thread appears under "Mes réponses vérifiées".

- [ ] **Step 1: Write failing tests**

```ts
test('splitIntoSteps splits on headings', ...)
test('splitIntoSteps falls back to paragraphs', ...)
test('splitIntoSteps never splits inside ``` or $$ blocks', ...)
```

- [ ] **Step 2: Run the tests and check that they fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the tests and check that they pass. Manual check: "Me tester" makes no request (Network tab is empty).**
- [ ] **Step 5: Commit** `feat: revision mode, similar exercise and answer check`

---

### Task 13: Storage page, settings, Markdown export

**Files:**
- Create: `server/routes/storage.ts`, `server/routes/export.ts`, `server/export/markdown.ts`, `web/components/StoragePage.tsx`
- Modify: `server/app.ts`, `web/App.tsx`, `web/components/ExerciseView.tsx`, `web/components/Library.tsx`
- Test: `tests/server/storage-routes.test.ts`, `tests/server/export.test.ts`

**Interfaces:**
- Produces:
  - `claudeHistoryDir(claudeCwd: string) → string` returns `~/.claude/projects/<encoded>`. The encoding replaces every character outside `[A-Za-z0-9]` in the absolute path with `-`. Verify it against a real folder in Task 14.
  - `GET /api/storage` → `{ dataDir, dataBytes, claudeHistoryDir, claudeHistoryBytes, model }`
  - `POST /api/storage/open` `{ target: 'data' | 'claudeHistory' }` calls `deps.openPath(path)`. If the folder is missing, it creates it first for `data`, and returns 404 `{ message: "Aucun historique Claude Code pour l'instant." }` for `claudeHistory`.
  - `PUT /api/settings` `{ model?: string | null, dataDir?: string }` saves the config. Changing `dataDir` closes and reopens the DB at the new location. Existing data is not moved: the response says so, and the UI shows it.
  - `exerciseToMarkdown(ex, version, comments, messagesByComment, attachments) → string`:
    - `# title`, `## Énoncé` (transcription or text, plus links to attachments `./fichiers/<name>`), `## Correction` (current version).
    - Comments as footnotes `[^c<id>]` placed after the anchored passage in the text. Footnote bodies hold the thread as `**Moi :** … / **Claude :** …`.
    - Detached and check-answer threads go in a `## Autres commentaires` section.
  - `GET /api/export/exercise/:id` and `GET /api/export/subject/:id` → a `.zip` holding `*.md` files and `fichiers/`. Use `fflate` `zipSync`.

StoragePage:
- Shows the data folder path and size, with the button **"Ouvrir le dossier de stockage"**.
- Shows the Claude Code history path and size, with the button "Ouvrir l'historique Claude Code".
- Has a model setting (empty means Claude Code's default) and a data folder setting.
- Shows the privacy note (fixed copy): « Les échanges envoyés à Claude transitent par Anthropic et suivent les réglages de confidentialité de ton compte claude.ai. Vider le stockage local ne les efface pas. »

- [ ] **Step 1: Write failing tests**

```ts
test('GET /api/storage reports sizes and paths', ...)
test('POST /api/storage/open data calls openPath with dataDir', ...)
test('POST /api/storage/open claudeHistory returns 404 message when folder missing', ...)
test('claudeHistoryDir encodes C:\\x\\revision-data\\claude-cwd as C--x-revision-data-claude-cwd', ...)
test('exerciseToMarkdown places footnote after the anchored passage and lists detached comments separately', ...)
test('export subject zip contains one .md per exercise and attachment files', ...)
```

- [ ] **Step 2: Run the tests and check that they fail**
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run the tests and check that they pass. Manual check: the button opens Windows Explorer on the data folder.**
- [ ] **Step 5: Commit** `feat: storage page, settings and markdown export`

---

### Task 14: End-to-end check with the real Claude Code

**Prerequisite (user action):** install the Claude Code CLI and log in with the subscription by running `claude` once in a terminal. Today the machine has no `claude` on PATH, only the desktop app.

- [ ] **Step 1:** Re-run Task 5 Step 1 with the installed CLI. Fix the flags in `cliProvider.ts` if they differ, and re-run `npm test`.
- [ ] **Step 2:** Run `scripts/lancer-revision.cmd`. Check that the browser opens on the app.
- [ ] **Step 3:** Create an exercise from a photo of a maths exercise. Generate the correction. Check that formulas render and that the statement transcription appears and is searchable.
- [ ] **Step 4:** Comment a passage, ask a question, then ask for "Schéma ici" once for a function curve and once for an algorithm. Check that both diagrams render.
- [ ] **Step 5:** "Corriger la correction" → accept → check v2 and the comment states.
- [ ] **Step 6:** Make an exercise from a `.docx` with code, comment one code line, and check that the highlight lands on that line.
- [ ] **Step 7:** Storage page: open both folders, check that the Claude history folder path from `claudeHistoryDir` really exists, and fix the encoding if not. Delete the data folder in Explorer, reload the app, and check that it starts empty without errors.
- [ ] **Step 8:** Stop the network mid-answer, or close the tab. Check that a French error with "Réessayer" appears and that no half version is saved.
- [ ] **Step 9: Commit** any fixes: `fix: adjustments from end-to-end check`
