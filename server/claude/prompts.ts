import { dirname } from 'node:path';
import type { Attachment, Exercise, Message } from '../../shared/types';
import { absolutePath } from '../files/storage';
import type { ClaudeRequest } from './provider';

export type AiAction =
  | { kind: 'generate'; exercise: Exercise; attachments: Attachment[]; instruction: string | null }
  | { kind: 'regenerate'; exercise: Exercise; attachments: Attachment[]; current: string; instruction: string }
  | { kind: 'comment'; exercise: Exercise; attachments: Attachment[]; current: string; quote: string; thread: Message[]; question: string }
  | { kind: 'diagram'; exercise: Exercise; attachments: Attachment[]; current: string; quote: string; thread: Message[]; request: string | null }
  | { kind: 'fix'; exercise: Exercise; attachments: Attachment[]; current: string; quote: string; thread: Message[]; instruction: string | null }
  | { kind: 'similar'; exercise: Exercise; attachments: Attachment[]; current: string }
  | { kind: 'check'; exercise: Exercise; attachments: Attachment[]; current: string; answerText: string | null; answerFiles: string[] };

export const SYSTEM_PROMPT = `Tu es un tuteur patient qui aide un étudiant à réviser (surtout maths, programmation et principes informatiques).
Réponds toujours en français, de façon claire et pédagogique, sans remplissage.

Format :
- Markdown. Formules en LaTeX : $...$ en ligne, $$...$$ en bloc.
- Code dans des blocs \`\`\`langage.
- Quand on te demande de lire un fichier joint (photo, PDF), utilise l'outil Read sur le chemin donné.

Schémas : quand un schéma aide (ou quand on t'en demande un), choisis le format LE PLUS LÉGER qui convient :
1. Organigramme, algorithme, automate, séquence, classes, arbre, carte mentale → bloc \`\`\`mermaid
   Exemple :
   \`\`\`mermaid
   flowchart TD
       A[Début] --> B{n > 0 ?}
       B -->|oui| C[n = n - 1]
       C --> B
       B -->|non| D[Fin]
   \`\`\`
   Mets entre guillemets les libellés qui contiennent des parenthèses ou des symboles : A["f(x) = x²"].
2. Courbe de fonction, tangente, aire, points remarquables → bloc \`\`\`function-plot contenant du JSON pour la bibliothèque function-plot (sans clé "target").
   Exemple :
   \`\`\`function-plot
   {"xAxis": {"domain": [-3, 3]}, "yAxis": {"domain": [-3, 6]}, "grid": true,
    "data": [{"fn": "x^2 - 2"}, {"fn": "2*x - 3", "color": "#888"}],
    "annotations": [{"x": 1, "text": "x = 1"}]}
   \`\`\`
3. Seulement si les deux autres ne conviennent pas (géométrie, vecteurs, figure libre) → bloc \`\`\`svg avec un SVG autonome (viewBox, pas de script, pas d'image externe).

Quand une consigne demande des sections, écris chaque marqueur (par exemple ===CORRECTION===) seul sur sa ligne, exactement comme indiqué, et rien avant le premier marqueur.`;

const VISUAL_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']);

function statementBlock(
  exercise: Exercise, attachments: Attachment[], dataDir: string, forceFiles: boolean,
): { text: string; dirs: string[] } {
  const parts: string[] = [];
  const dirs = new Set<string>();
  parts.push(`Titre : ${exercise.title}`);
  if (exercise.statementTranscription && !forceFiles) {
    parts.push(exercise.statementTranscription);
  } else {
    if (exercise.statementText.trim()) parts.push(exercise.statementText);
    const visual = attachments.filter((a) => VISUAL_MIMES.has(a.mime));
    if (visual.length) {
      parts.push('Fichiers de l\'énoncé à lire avec l\'outil Read :');
      for (const a of visual) {
        const p = absolutePath(dataDir, a.relPath);
        parts.push(`- ${p}`);
        dirs.add(dirname(p));
      }
    }
  }
  for (const a of attachments) {
    if (a.extractedText) parts.push(`Contenu de ${a.fileName} :\n${a.extractedText}`);
  }
  return { text: `<enonce>\n${parts.join('\n\n')}\n</enonce>`, dirs: [...dirs] };
}

function threadBlock(thread: Message[]): string {
  if (!thread.length) return '';
  const lines = thread.map((m) => `${m.role === 'user' ? 'Étudiant' : 'Toi'} : ${m.content}`);
  return `<fil_du_commentaire>\n${lines.join('\n\n')}\n</fil_du_commentaire>`;
}

const corr = (current: string) => `<correction_actuelle>\n${current}\n</correction_actuelle>`;
const quoteBlock = (quote: string) => `<passage_surligne>\n${quote}\n</passage_surligne>`;

export function buildRequest(action: AiAction, ctx: { dataDir: string; model: string | null }): ClaudeRequest {
  const hasVisual = action.attachments.some((a) => VISUAL_MIMES.has(a.mime));
  const st = statementBlock(action.exercise, action.attachments, ctx.dataDir, action.kind === 'generate');
  const readableDirs = [...st.dirs];
  let body: string[];

  switch (action.kind) {
    case 'generate': {
      const sections = hasVisual
        ? 'Réponds avec deux sections :\n===ENONCE===\n(la transcription fidèle de l\'énoncé en Markdown, formules en LaTeX)\n===CORRECTION===\n(la correction)'
        : 'Réponds avec une section :\n===CORRECTION===\n(la correction)';
      body = [
        st.text,
        'Rédige une correction complète et pédagogique de cet exercice, étape par étape, en justifiant chaque étape.',
        action.instruction ? `Consigne de l'étudiant : ${action.instruction}` : '',
        sections,
      ];
      break;
    }
    case 'regenerate':
      body = [
        st.text, corr(action.current),
        `Réécris entièrement la correction en suivant cette consigne de l'étudiant : ${action.instruction}`,
        'Réponds avec une section :\n===CORRECTION===\n(la nouvelle correction complète)',
      ];
      break;
    case 'comment':
      body = [
        st.text, corr(action.current), quoteBlock(action.quote), threadBlock(action.thread),
        `L'étudiant pose une question sur le passage surligné. Réponds précisément à cette question, sans réécrire toute la correction.`,
        `Question : ${action.question}`,
      ];
      break;
    case 'diagram':
      body = [
        st.text, corr(action.current), quoteBlock(action.quote), threadBlock(action.thread),
        'Produis un schéma qui explique le passage surligné, dans le format le plus léger qui convient, avec une ou deux phrases d\'explication.',
        action.request ? `Précision de l'étudiant : ${action.request}` : '',
      ];
      break;
    case 'fix':
      body = [
        st.text, corr(action.current), quoteBlock(action.quote), threadBlock(action.thread),
        'La discussion montre que le passage surligné est faux ou mal expliqué. Réécris UNIQUEMENT ce passage, corrigé, pour qu\'il s\'insère à sa place dans la correction (même niveau de détail, même mise en forme).',
        action.instruction ? `Consigne de l'étudiant : ${action.instruction}` : '',
        'Réponds avec une section :\n===REMPLACEMENT===\n(le nouveau texte du passage, rien d\'autre)',
      ];
      break;
    case 'similar':
      body = [
        st.text, corr(action.current),
        'Invente un exercice similaire (même notion, mêmes difficultés, valeurs ou contexte différents) et sa correction complète.',
        'Réponds avec deux sections :\n===ENONCE===\n(l\'énoncé du nouvel exercice)\n===CORRECTION===\n(sa correction)',
      ];
      break;
    case 'check': {
      const files = action.answerFiles.length
        ? `Fichiers de la réponse de l'étudiant à lire avec l'outil Read :\n${action.answerFiles.map((f) => `- ${f}`).join('\n')}`
        : '';
      for (const f of action.answerFiles) if (!readableDirs.includes(dirname(f))) readableDirs.push(dirname(f));
      body = [
        st.text, corr(action.current),
        action.answerText ? `<reponse_etudiant>\n${action.answerText}\n</reponse_etudiant>` : '',
        files,
        'Compare la réponse de l\'étudiant à la correction. Dis ce qui est juste, puis précisément où ça coince et pourquoi, sans redonner toute la correction.',
      ];
      break;
    }
  }

  return {
    systemPrompt: SYSTEM_PROMPT,
    prompt: body.filter((s) => s && s.trim()).join('\n\n'),
    readableDirs,
    model: ctx.model,
  };
}
