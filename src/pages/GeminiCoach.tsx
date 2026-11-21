import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Sparkles } from 'lucide-react';
import { askCoach, coachConfigured, RequestError } from '../services/evidenceApi';
import type { CoachMessage } from '../services/evidenceApi';

const labels: Record<string, string> = {
  read_vacancy: 'Read vacancy',
  read_resume_lines: 'Read resume lines',
  search_resume: 'Searched resume',
  submit_report: 'Submitted evidence report',
};

export function AgentActivity({ trace, sample }: { trace: string[]; sample?: boolean }) {
  if (!trace.length) return null;
  return <details className="agent-activity" open>
    <summary>{sample ? 'Sample tool activity' : 'Gemini tool activity'}</summary>
    <ol>{trace.map((step, index) => <li key={index}>{labels[step] ?? step}</li>)}</ol>
  </details>;
}

const exampleQuestion = 'What should I clarify about my leadership experience?';
const example: CoachMessage[] = [
  { role: 'user', text: exampleQuestion },
  { role: 'model', text: 'Line 8 says you mentored two engineers and led weekly architecture reviews. The vacancy asks for leadership across multiple teams. If the reviews included other teams, explain which teams participated and which decisions you led. Keep the existing wording if all participants were on the same team.', trace: ['read_vacancy', 'search_resume'] },
];

export default function GeminiCoach({ resume, job, sample }: { resume: string; job: string; sample: boolean }) {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    try {
      const result = await askCoach(trimmed, messages, resume, job, controller.signal);
      if (controller.signal.aborted) return;
      setMessages([...messages, { role: 'user', text: trimmed }, { role: 'model', text: result.reply, trace: result.trace }]);
      setQuestion('');
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof RequestError ? failure.message : 'Gemini could not answer. Please try again.');
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  function clear() {
    pending.current?.abort();
    pending.current = null;
    setMessages([]);
    setQuestion('');
    setError('');
    setBusy(false);
  }

  return <section className="panel coverage coach" aria-labelledby="coach-title">
    <div className="coach-heading"><span className="icon-tile"><Sparkles size={18} /></span>
      <div><h3 id="coach-title">Gemini Career Coach</h3>
        <p className="muted">{resume ? 'Ask about evidence gaps, truthful wording, or interview preparation for this vacancy.' : 'Ask a career question, or run a comparison to give Gemini the resume and vacancy as context.'}</p>
      </div>
      {!!messages.length && <button className="text-button coach-clear" type="button" onClick={clear}>Clear chat</button>}
    </div>
    {!!messages.length && <div className="coach-thread" role="log" aria-label="Career Coach conversation">
      {messages.map(({ role, text, trace }, index) => <article key={index} className="coach-message">
        <strong>{role === 'user' ? 'You' : sample ? 'Sample reply' : 'Gemini'}</strong>
        <p>{text}</p>
        {trace && <AgentActivity trace={trace} sample={sample} />}
      </article>)}
    </div>}
    {sample ? <button className="button button-light" type="button" onClick={() => setMessages(example)} disabled={!!messages.length}>{exampleQuestion}</button>
      : coachConfigured ? <form className="coach-form" onSubmit={ask}>
        <label htmlFor="coach-question">Ask Gemini</label>
        <div className="coach-input">
          <input id="coach-question" value={question} maxLength={1000} onChange={(event) => setQuestion(event.target.value)} disabled={busy} />
          <button className="button button-primary" disabled={busy || !question.trim()}>{busy ? 'Asking…' : 'Send'}</button>
        </div>
      </form> : <p className="muted">Configure the Gemini backend to chat, or explore the sample conversation.</p>}
    {busy && <p role="status">Gemini is working on your question…</p>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
