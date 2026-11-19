export type Id = number;

export interface Subject { id: Id; name: string; position: number }
export interface Chapter { id: Id; subjectId: Id; name: string; position: number }
export interface Exercise {
  id: Id; chapterId: Id; parentId: Id | null; title: string;
  statementText: string; statementTranscription: string | null; createdAt: string;
}
export interface Attachment {
  id: Id; exerciseId: Id; fileName: string; mime: string;
  relPath: string; size: number; extractedText: string | null;
}
export type VersionReason = 'initial' | 'fix' | 'regenerate';
export interface CorrectionVersion {
  id: Id; exerciseId: Id; number: number; markdown: string;
  reason: VersionReason; triggerCommentId: Id | null; instruction: string | null; createdAt: string;
}
export interface Anchor { exact: string; prefix: string; suffix: string; start: number; end: number; kind: 'text' | 'block' }
export type CommentStatus = 'open' | 'resolved' | 'detached';
export type CommentKind = 'passage' | 'check-answer';
export interface Comment {
  id: Id; exerciseId: Id; versionId: Id; anchor: Anchor | null;
  status: CommentStatus; changed: boolean; kind: CommentKind; createdAt: string;
}
export interface Message { id: Id; commentId: Id; role: 'user' | 'assistant'; content: string; createdAt: string }
export interface LibraryTree {
  subjects: (Subject & { chapters: (Chapter & { exercises: Pick<Exercise, 'id' | 'title' | 'parentId'>[] })[] })[];
}
export interface SearchHit { exerciseId: Id; title: string; snippet: string; source: 'title' | 'statement' | 'correction' | 'comment' }
