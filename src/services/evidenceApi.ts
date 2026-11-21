import type { AnalysisState, CompletedAnalysis } from '../application';

const endpoint = import.meta.env.VITE_ANALYSIS_URL;
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const coachEndpoint = import.meta.env.VITE_COACH_URL || endpoint?.replace(/\/analyzeResume$/, '/chatWithGemini');
export const coachConfigured = Boolean(apiKey && projectId && coachEndpoint && coachEndpoint !== endpoint);
export const liveConfigured = Boolean(endpoint && apiKey && projectId);

type Failure = Extract<AnalysisState, { status: 'failed' }>;

export class RequestError extends Error {
  constructor(public detail: Failure['error']) {
    super(detail.message);
  }
}

let tokenRequest: Promise<string> | undefined;

function sessionToken() {
  tokenRequest ??= getSessionToken().finally(() => { tokenRequest = undefined; });
  return tokenRequest;
}

async function getSessionToken() {
  const [{ initializeApp, getApps }, { getAuth, inMemoryPersistence, initializeAuth, signInAnonymously }] =
    await Promise.all([import('@firebase/app'), import('@firebase/auth')]);
  const existing = getApps().find(({ name }) => name === 'resume-analysis');
  const auth = existing
    ? getAuth(existing)
    : initializeAuth(initializeApp({ apiKey, projectId }, 'resume-analysis'), { persistence: inMemoryPersistence });
  return (auth.currentUser ?? (await signInAnonymously(auth)).user).getIdToken();
}

function fileAttachment(file: File) {
  return new Promise<{ type: string; base64: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new RequestError({ code: 'file_read', message: 'The file could not be read. Choose it again or paste the text.', retryable: true }));
    reader.onload = () => resolve({
      type: file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/plain',
      base64: String(reader.result).split(',')[1],
    });
    reader.readAsDataURL(file);
  });
}

export async function analyze(resumeText: string, file: File | null, jobDescription: string, signal: AbortSignal): Promise<CompletedAnalysis> {
  if (!liveConfigured) {
    throw new RequestError({ code: 'setup_required', message: 'Live analysis is unavailable in this build. You can still explore the sample report.', retryable: false });
  }
  const [token, resume] = await Promise.all([
    sessionToken(),
    file ? fileAttachment(file).then((attachment) => ({ file: attachment })) : { resumeText },
  ]);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...resume, jobDescription }),
    signal,
  });
  const result = await response.json();
  if (result?.status === 'failed' && typeof result.error?.message === 'string') throw new RequestError(result.error);
  if (!response.ok || result?.status !== 'completed' || typeof result.original !== 'string'
      || !Array.isArray(result.report?.requirements) || !Array.isArray(result.report?.rewrites)) {
    throw new Error('Unexpected analysis response');
  }
  return result;
}

export type CoachMessage = { role: 'user' | 'model'; text: string; trace?: string[] };
export type CoachReply = { reply: string; trace: string[] };

export async function askCoach(message: string, history: CoachMessage[], resumeText: string, jobDescription: string,
  signal: AbortSignal): Promise<CoachReply> {
  const token = await sessionToken();
  const response = await fetch(coachEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, history: history.slice(-8).map(({ role, text }) => ({ role, text })), resumeText, jobDescription }),
    signal,
  });
  const result = await response.json();
  if (result?.status === 'failed' && typeof result.error?.message === 'string') throw new RequestError(result.error);
  if (!response.ok || result?.status !== 'completed' || typeof result.reply !== 'string' || !Array.isArray(result.trace)) {
    throw new Error('Unexpected coach response');
  }
  return result;
}
