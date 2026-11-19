import type { Attachment, Comment, CorrectionVersion, Exercise, Id, Message } from '../../shared/types';

const indent = (text: string) => text.split('\n').map((l, i) => (i === 0 ? l : l ? `    ${l}` : '')).join('\n');

function threadText(messages: Message[]): string {
  return messages
    .map((m) => `${m.role === 'user' ? '**Moi :**' : '**Claude :**'} ${m.content.trim()}`)
    .join('\n\n');
}

export function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 120) || 'Sans titre';
}

/** One exercise as a standalone Markdown document: statement, current correction, comments as footnotes. */
export function exerciseToMarkdown(
  ex: Exercise, version: CorrectionVersion | null, comments: Comment[],
  messagesByComment: Record<Id, Message[]>, attachments: Attachment[],
): string {
  const parts: string[] = [`# ${ex.title}`, '## Énoncé'];
  const statement = (ex.statementTranscription ?? ex.statementText).trim();
  if (statement) parts.push(statement);
  for (const a of attachments) {
    const link = `fichiers/${ex.id}/${a.relPath.split('/').pop()}`;
    parts.push(a.mime.startsWith('image/') ? `![${a.fileName}](${link})` : `[${a.fileName}](${link})`);
  }

  parts.push('## Correction');
  const anchored = version
    ? comments.filter((c) => c.kind === 'passage' && c.status !== 'detached' && c.anchor && c.anchor.end <= version.markdown.length)
    : [];
  if (version) {
    let body = version.markdown;
    // Insert footnote references from the end so earlier offsets stay valid.
    for (const c of [...anchored].sort((a, b) => b.anchor!.end - a.anchor!.end)) {
      const ref = c.anchor!.kind === 'block' ? `\n\n[^c${c.id}]` : `[^c${c.id}]`;
      body = body.slice(0, c.anchor!.end) + ref + body.slice(c.anchor!.end);
    }
    parts.push(body);
  } else {
    parts.push('_Pas encore de correction._');
  }

  const notes = anchored
    .sort((a, b) => a.anchor!.start - b.anchor!.start)
    .map((c) => `[^c${c.id}]: ${indent(threadText(messagesByComment[c.id] ?? []))}`);
  if (notes.length) parts.push(notes.join('\n\n'));

  const others = comments.filter((c) => !anchored.includes(c) && (messagesByComment[c.id]?.length ?? 0) > 0);
  if (others.length) {
    parts.push('## Autres commentaires');
    for (const c of others) {
      const title = c.kind === 'check-answer'
        ? '### Réponse vérifiée'
        : `### Commentaire détaché${c.anchor ? ` — « ${c.anchor.exact.replace(/\s+/g, ' ').slice(0, 80)} »` : ''}`;
      parts.push(title, threadText(messagesByComment[c.id] ?? []));
    }
  }
  return `${parts.join('\n\n')}\n`;
}
