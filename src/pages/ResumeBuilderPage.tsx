import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Printer, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import { downloadProfile, importProfile, MAX_FILE_BYTES, MAX_RESUME_CHARS } from '../application';
import type { Profile } from '../application';

export default function ResumeBuilderPage({ profile, onProfile }: { profile: Profile | null; onProfile: (profile: Profile | null) => void }) {
  const [template, setTemplate] = useState('classic');
  const [message, setMessage] = useState('');
  const preview = useRef<HTMLDivElement>(null);
  const selection = useRef(0);
  useEffect(() => () => { selection.current++; }, []);
  const text = profile?.resume.text ?? '';
  const print = useReactToPrint({ contentRef: preview, documentTitle: 'Tailored resume' });
  const [name, ...lines] = text.split('\n');

  function updateText(value: string) {
    onProfile(value ? { schema: 'resume-ai.profile', version: 1, resume: { text: value } } : null);
  }

  async function exportWord() {
    try {
      const [{ Document, Packer, Paragraph, TextRun }, { saveAs }] = await Promise.all([import('docx'), import('file-saver')]);
      const document = new Document({ sections: [{ children: [
        new Paragraph({ children: [new TextRun({ text: name, bold: true, size: 36 })] }),
        ...lines.map((line) => new Paragraph(line)),
      ] }] });
      saveAs(await Packer.toBlob(document), 'tailored-resume.docx');
    } catch {
      setMessage('Word export failed. Please try again.');
    }
  }

  return <div className="workspace builder">
    <Link className="text-button back-link" to="/"><ArrowLeft size={16} /> Back to comparison</Link>
    <div className="report-heading">
      <div><h1>Resume Builder</h1><p>Import a profile, choose a template, and print your resume.</p></div>
      <button className="button button-primary" disabled={!text.trim()} onClick={() => print()}><Printer size={17} /> Print / Save PDF</button>
    </div>
    <div className="builder-grid">
      <section className="panel builder-controls">
        <div className="builder-import">
          <label className="button button-light file-button"><Upload size={16} /> Import profile JSON
            <input type="file" aria-label="Import profile JSON" accept=".json,application/json" onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              const request = ++selection.current;
              setMessage('');
              try {
                if (file.size > MAX_FILE_BYTES) throw new Error('Choose a profile up to 2 MB.');
                const imported = importProfile(JSON.parse(await file.text()));
                if (request !== selection.current) return;
                onProfile(imported);
                setMessage('Profile imported.');
              } catch (error) {
                if (request !== selection.current) return;
                setMessage(error instanceof SyntaxError ? 'This file does not contain valid JSON.' : error instanceof Error ? error.message : 'The profile could not be imported.');
              }
            }} />
          </label>
        </div>
        <label htmlFor="template">Template</label>
        <select id="template" value={template} onChange={(event) => setTemplate(event.target.value)}>
          <option value="classic">Classic</option><option value="modern">Modern</option>
        </select>
        <label htmlFor="profile-text">Resume text</label>
        <textarea id="profile-text" value={text} maxLength={MAX_RESUME_CHARS + 5_600} placeholder="Import a profile or paste your resume…"
          onChange={(event) => { selection.current++; setMessage(''); updateText(event.target.value); }} />
        <div className="builder-actions">
          <button className="text-button" disabled={!text.trim()} onClick={() => { selection.current++; onProfile(null); setMessage('Profile cleared.'); }}>Clear profile</button>
          <button className="text-button" disabled={!text.trim()} onClick={() => void exportWord()}>Download Word</button>
          <button className="text-button" disabled={!text.trim()} onClick={async () => {
            try { await navigator.clipboard.writeText(text); setMessage('Resume copied.'); }
            catch { setMessage('Clipboard access failed. Select and copy the resume text.'); }
          }}>Copy text</button>
          <button className="text-button" disabled={!text.trim()} onClick={() => profile && downloadProfile(profile)}><Download size={15} /> Export JSON</button>
        </div>
        {message && <p className="muted" role="status">{message}</p>}
      </section>
      <section aria-label="Resume preview" className="preview-frame">
        {text.trim() ? <div ref={preview} className={`resume-paper ${template}`}>
          <h2>{name}</h2>
          <div className="resume-lines">{lines.map((line, index) => line && line === line.toUpperCase() && /^\p{L}[\p{L}\s&]+$/u.test(line)
            ? <h3 key={index}>{line}</h3>
            : <p key={index}>{line || '\u00a0'}</p>)}</div>
        </div> : <div className="resume-paper muted">Your resume preview will appear here.</div>}
      </section>
    </div>
  </div>;
}
