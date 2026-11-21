import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowDown, ArrowRight, ClipboardList, FileCheck2, FileText, LoaderCircle, Trash2, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { downloadProfile, MAX_FILE_BYTES, MAX_JOB_CHARS, MAX_RESUME_CHARS, tailoredProfile } from '../application';
import type { AnalysisState, Finding, Profile } from '../application';
import { analyze, liveConfigured, RequestError } from '../services/evidenceApi';
import GeminiCoach, { AgentActivity } from './GeminiCoach';
import { sampleJob, sampleReport, sampleResume } from '../sample';

const findings: Record<Finding, string> = {
  supported: 'Supported',
  not_demonstrated: 'Not demonstrated',
  review: 'Review supporting detail',
};

export default function ApplicationPage({ onProfile, onClear }: { onProfile: (profile: Profile) => void; onClear: () => void }) {
  const [resume, setResume] = useState('');
  const [job, setJob] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [fileError, setFileError] = useState('');
  const [coachSession, setCoachSession] = useState(0);
  const [demo, setDemo] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  const report = state.status === 'completed' ? state : null;

  function resetReport() {
    pending.current?.abort();
    pending.current = null;
    setDemo(false);
    setState({ status: 'idle' });
    setApproved(new Set());
    setConfirmed(new Set());
  }

  function clearFile() {
    setFile(null);
    setFileError('');
    if (input.current) input.current.value = '';
  }

  function clearWorkspace() {
    resetReport();
    setCoachSession((session) => session + 1);
    clearFile();
    setResume('');
    setJob('');
    onClear();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetReport();
    const controller = new AbortController();
    pending.current = controller;
    setState({ status: 'processing' });
    try {
      const result = await analyze(resume, file, job, controller.signal);
      if (!controller.signal.aborted) {
        setState(result);
        showReport();
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ status: 'failed', error: error instanceof RequestError ? error.detail : {
        code: 'request_failed', message: 'Analysis could not be completed. Check your connection and retry.', retryable: true,
      } });
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }

  function toggle(set: Set<number>, line: number) {
    const next = new Set(set);
    if (next.has(line)) next.delete(line);
    else next.add(line);
    return next;
  }

  function showReport() {
    requestAnimationFrame(() => {
      document.getElementById('report-title')?.focus({ preventScroll: true });
      document.getElementById('evidence-report')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    });
  }

  function loadSample() {
    resetReport();
    clearFile();
    setResume(sampleResume);
    setJob(sampleJob);
    setDemo(true);
    setState(sampleReport);
    showReport();
  }

  return (
    <div className="workspace">
      <section className="hero">
        <div className="hero-copy">
          <h1>Tailor your resume<br /> to the <em>role.</em></h1>
          <p>Gemini reads the vacancy, searches your resume for evidence, and proposes edits for your approval.</p>
        </div>
        <button className="button button-light" type="button" onClick={loadSample}>Explore sample <ArrowDown size={17} /></button>
      </section>

      <form className="intake" onSubmit={submit}>
        <div className="document-grid">
          <section className="panel document">
            <label className="document-label" htmlFor="resume"><span className="icon-tile"><FileText size={19} /></span><span>Your resume</span></label>
            <textarea id="resume" placeholder="Paste your resume text here…" value={resume} disabled={!!file} maxLength={MAX_RESUME_CHARS}
              onChange={(event) => { resetReport(); setResume(event.target.value); }} />
            <div className="file-row">
              <label className="file-button"><Upload size={15} /> Upload PDF or TXT
                <input ref={input} type="file" aria-label="Upload PDF or TXT" accept=".pdf,.txt,application/pdf,text/plain"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (!selected) return;
                    resetReport();
                    clearFile();
                    if (!/\.(pdf|txt)$/i.test(selected.name) || !selected.size || selected.size > MAX_FILE_BYTES) {
                      setFileError('Choose a nonempty PDF or TXT file up to 2 MB.');
                      return;
                    }
                    setFile(selected);
                  }} />
              </label>
              {file ? <button className="text-button filename" type="button" onClick={() => { resetReport(); clearFile(); }}>Remove {file.name}</button> : <span>Up to 2 MB</span>}
            </div>
            {fileError && <p role="alert" className="error">{fileError}</p>}
          </section>
          <section className="panel document">
            <label className="document-label" htmlFor="vacancy"><span className="icon-tile"><ClipboardList size={19} /></span><span>Job description</span></label>
            <textarea id="vacancy" required placeholder="Paste the vacancy and its requirements here…" value={job} maxLength={MAX_JOB_CHARS}
              onChange={(event) => { resetReport(); setJob(event.target.value); }} />
            <div className="file-row"><span>{job.length.toLocaleString()} / 12,000 characters</span></div>
          </section>
        </div>
        <div className="form-actions">
          <button className="text-button" type="button" onClick={clearWorkspace}><Trash2 size={16} /> Clear workspace</button>
          <button className="button button-primary" disabled={!liveConfigured || (!file && !resume.trim()) || !job.trim() || state.status === 'processing'}>
            {state.status === 'processing' ? <><LoaderCircle size={17} className="animate-spin" /> Gemini is working…</> : <>Run Gemini agent <ArrowRight size={17} /></>}
          </button>
        </div>
        {!liveConfigured && <p className="setup-note">Live analysis requires a configured backend. The sample report and Resume Builder are available.</p>}
        {state.status === 'processing' && <p role="status">Gemini is inspecting the vacancy and resume. Tool activity will appear with the report.</p>}
        {state.status === 'failed' && <p role="alert" className="error">{state.error.message}{state.error.retryable && ' Select “Run Gemini agent” to try again.'}</p>}
      </form>

      {report && <section id="evidence-report" className="report" aria-labelledby="report-title">
        <div className="report-heading">
          <div><h2 id="report-title" tabIndex={-1}>Evidence report</h2><p>{demo ? 'Sample application · Senior Backend Engineer' : 'Vacancy comparison'}</p></div>
          <span className="parse"><FileCheck2 size={17} /> {report.parsing.lineCount} readable lines · {report.parsing.source}</span>
        </div>
        <div className="panel coverage">
          {!!report.trace?.length && <AgentActivity trace={report.trace} sample={demo} />}
          <h3>Requirement coverage</h3>
          <p className="muted">“Not demonstrated” means no supporting statement was found in this resume.</p>
          <div className="table-scroll"><table>
            <thead><tr><th scope="col">Requirement</th><th scope="col">Resume evidence</th><th scope="col">Finding</th></tr></thead>
            <tbody>{report.report.requirements.map(({ requirement, evidence, finding }) => <tr key={requirement}>
              <th scope="row">{requirement}</th>
              <td>{evidence.length ? evidence.map(({ line, text }) => <blockquote key={line}>{text}<cite>Line {line}</cite></blockquote>) : 'No supporting statement found'}</td>
              <td><span className={`finding ${finding}`}>{findings[finding]}</span></td>
            </tr>)}</tbody>
          </table></div>
          <details className="original"><summary>View original resume</summary><pre>{report.original}</pre></details>
        </div>
        <div className="panel coverage"><h3>Writing feedback</h3>
          {report.report.feedback.length ? <ul className="feedback">{report.report.feedback.map((note) => <li key={note}>{note}</li>)}</ul> : <p className="muted">No writing suggestions were returned.</p>}
        </div>
        <div className="panel coverage">
          <h3>Review proposed edits</h3>
          <p className="muted">Check each rewrite against the supporting facts. Only approved edits appear in the tailored profile.</p>
          {!report.report.rewrites.length && <p className="muted">No rewrites were proposed.</p>}
          {report.report.rewrites.map(({ line, original, proposed, facts, claimsToConfirm, newTerms }) => {
            const needsConfirmation = claimsToConfirm.length > 0 || newTerms.length > 0;
            return <article key={line} className="rewrite">
              <div className="rewrite-grid"><div><h4>Original · line {line}</h4><p>{original}</p></div><div><h4>Proposed rewrite</h4><p>{proposed}</p></div></div>
              <details open><summary>Supporting facts</summary><ul>{facts.map((fact) => <li key={fact.line}>Line {fact.line} · {fact.text}</li>)}</ul></details>
              {needsConfirmation && <div className="confirm">
                {claimsToConfirm.length > 0 && <p><strong>Claims to verify</strong> · {claimsToConfirm.join(', ')}</p>}
                {newTerms.length > 0 && <p><strong>New wording</strong> · {newTerms.join(', ')}</p>}
                <label><input type="checkbox" checked={confirmed.has(line)} onChange={() => {
                  if (confirmed.has(line) && approved.has(line)) setApproved(toggle(approved, line));
                  setConfirmed(toggle(confirmed, line));
                }} /> I verified that the rewrite preserves the facts.</label>
              </div>}
              <label className="approve"><input type="checkbox" checked={approved.has(line)} disabled={needsConfirmation && !confirmed.has(line)}
                onChange={() => setApproved(toggle(approved, line))} /> Approve this rewrite</label>
            </article>;
          })}
          <div className="export-row">
            <span role="status">{approved.size} approved {approved.size === 1 ? 'edit' : 'edits'}</span>
            <div className="button-row">
              <button className="button button-light" type="button" onClick={() => downloadProfile(tailoredProfile(report, approved))}>Export profile JSON</button>
              <Link className="button button-primary" to="/resume-builder" onClick={() => onProfile(tailoredProfile(report, approved))}>Open in Resume Builder <ArrowRight size={17} /></Link>
            </div>
          </div>
          <p className="muted">Import the JSON in <a className="text-button" href="https://psdevtool.online/resume/">PSDevTool Resume Builder</a> to use its templates.</p>
        </div>
      </section>}
      <GeminiCoach key={`${coachSession}-${demo ? 'sample' : report ? 'report' : 'general'}`} resume={report?.original ?? ''} job={report ? job : ''} sample={demo} />
    </div>
  );
}
