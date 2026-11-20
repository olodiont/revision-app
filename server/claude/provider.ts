export interface ClaudeRequest {
  systemPrompt: string;
  prompt: string;
  /** Folders Claude may read (attachments). Nothing else is readable. */
  readableDirs: string[];
  /** Images and PDFs to show Claude (absolute paths): attached directly in API mode, read with the Read tool by Claude Code. */
  files: string[];
  model: string | null;
  signal?: AbortSignal;
}

export type ClaudeErrorCode = 'not_installed' | 'not_logged_in' | 'usage_limit' | 'interrupted' | 'unknown';

export type ClaudeEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; fullText: string }
  | { type: 'error'; code: ClaudeErrorCode; message: string };

/** The only way the app talks to Claude. Swap the implementation to change how Claude is reached. */
export interface ClaudeProvider {
  send(req: ClaudeRequest): AsyncIterable<ClaudeEvent>;
}

export const ERROR_MESSAGES_FR: Record<ClaudeErrorCode, string> = {
  not_installed: "Claude Code n'est pas installé ou introuvable. Installe-le puis relance l'app.",
  not_logged_in: "Claude Code n'est pas connecté à ton compte. Lance `claude` dans un terminal pour te connecter.",
  usage_limit: "Limite d'usage de ton abonnement atteinte. Réessaie plus tard.",
  interrupted: 'La réponse a été interrompue.',
  unknown: 'Erreur de Claude Code.',
};
