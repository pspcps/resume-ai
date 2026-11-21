import { psDevToolDraft } from './psDevTool';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_RESUME_CHARS = 30_000;
export const MAX_JOB_CHARS = 12_000;

export type Finding = 'supported' | 'not_demonstrated' | 'review';
type Evidence = { line: number; text: string };

export type Rewrite = {
  line: number;
  original: string;
  proposed: string;
  facts: Evidence[];
  claimsToConfirm: string[];
  newTerms: string[];
};

export type CompletedAnalysis = {
  status: 'completed';
  trace?: string[];
  parsing: { source: string; lineCount: number };
  original: string;
  report: {
    requirements: { requirement: string; finding: Finding; evidence: Evidence[] }[];
    feedback: string[];
    rewrites: Rewrite[];
  };
};

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'processing' }
  | CompletedAnalysis
  | { status: 'failed'; error: { code: string; message: string; retryable: boolean } };

export type Profile = {
  schema: 'resume-ai.profile';
  version: 1;
  resume: { text: string };
};

export function tailoredProfile(analysis: CompletedAnalysis, approved: ReadonlySet<number>): Profile {
  const changes = new Map(analysis.report.rewrites
    .filter(({ line }) => approved.has(line))
    .map(({ line, proposed }) => [line, proposed]));
  const text = analysis.original.split('\n').map((line, index) => changes.get(index + 1) ?? line).join('\n');
  return { schema: 'resume-ai.profile', version: 1, resume: { text } };
}

export function importProfile(value: unknown): Profile {
  const draft = value as { version?: unknown; resumeAi?: { text?: unknown } } | null;
  const text = draft?.resumeAi?.text;
  if (draft?.version !== 1 || typeof text !== 'string' || !text.trim() || text.length > MAX_RESUME_CHARS + 5_600) {
    throw new Error('Choose a version 1 Resume AI profile with valid resume text.');
  }
  return { schema: 'resume-ai.profile', version: 1, resume: { text } };
}

export function downloadProfile(profile: Profile) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(psDevToolDraft(profile.resume.text), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tailored-resume.profile.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
