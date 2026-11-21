const Ajv = require('ajv');

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_RESUME_CHARS = 30_000;
const MAX_JOB_CHARS = 12_000;

class AnalysisError extends Error {
  constructor(status, code, message, retryable = false) {
    super(message);
    Object.assign(this, { status, code, retryable });
  }
}

const text = (maxLength) => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' });
const array = (items, maxItems, minItems = 0) => ({ type: 'array', items, maxItems, minItems, uniqueItems: true });
const object = (properties) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});
const lineId = { type: 'integer', minimum: 1 };

const validate = new Ajv().compile(object({
  requirements: array(object({
    requirement: text(500),
    finding: { enum: ['supported', 'not_demonstrated', 'review'] },
    evidence: array(lineId, 4),
  }), 15, 1),
  feedback: array(text(500), 8),
  rewrites: array(object({
    line: lineId,
    proposed: text(700),
    facts: array(lineId, 5, 1),
    introduced: array(text(100), 10),
  }), 8),
}));

function normalize(value) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function newTerms(original, proposed) {
  const words = (value) => value.match(/[\p{L}\p{N}][\p{L}\p{N}+#./%’-]*/gu) ?? [];
  const known = new Set(words(original).map(normalize));
  return [...new Map(words(proposed).filter((word) => !known.has(normalize(word)))
    .map((word) => [normalize(word), word])).values()];
}

function invalidModelResponse() {
  return new AnalysisError(502, 'invalid_model_output', 'The analysis service returned an incomplete or invalid report. Please retry.', true);
}

function parseReport(raw, lines, jobDescription) {
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    throw invalidModelResponse();
  }
  if (!validate(report)) throw invalidModelResponse();

  const vacancy = normalize(jobDescription);
  const requirementSet = new Set();
  const rewriteSet = new Set();
  const hasLine = (id) => Boolean(lines[id - 1]?.trim());
  const requirements = report.requirements.map((item) => {
    const quote = normalize(item.requirement);
    if (!vacancy.includes(quote) || requirementSet.has(quote)
        || !item.evidence.every(hasLine)
        || (item.finding === 'not_demonstrated') !== (item.evidence.length === 0)) {
      throw invalidModelResponse();
    }
    requirementSet.add(quote);
    return { ...item, evidence: item.evidence.map((line) => ({ line, text: lines[line - 1] })) };
  });

  const rewrites = report.rewrites.map((item) => {
    const original = lines[item.line - 1];
    if (!hasLine(item.line) || !item.facts.every(hasLine) || !item.facts.includes(item.line)
        || rewriteSet.has(item.line) || /[\r\n]/.test(item.proposed)
        || normalize(original) === normalize(item.proposed)) {
      throw invalidModelResponse();
    }
    rewriteSet.add(item.line);
    return {
      line: item.line,
      original,
      proposed: item.proposed.trim(),
      facts: item.facts.map((line) => ({ line, text: lines[line - 1] })),
      claimsToConfirm: item.introduced,
      newTerms: newTerms(original, item.proposed),
    };
  });

  return { requirements, feedback: report.feedback, rewrites };
}

async function readResume(body, extractPdf) {
  const { resumeText, file } = body;
  let source = 'pasted text';
  let value = resumeText;
  if (file !== undefined) {
    if (resumeText !== undefined || !file || !['application/pdf', 'text/plain'].includes(file.type)
        || typeof file.base64 !== 'string' || !file.base64.length) {
      throw new AnalysisError(400, 'invalid_file', 'Provide one PDF or plain-text file.');
    }
    if (file.base64.length > Math.ceil(MAX_FILE_BYTES / 3) * 4) {
      throw new AnalysisError(413, 'file_too_large', 'Choose a file that is 2 MB or smaller.');
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(file.base64) || file.base64.length % 4 !== 0) {
      throw new AnalysisError(400, 'invalid_file', 'The file payload is invalid.');
    }
    const bytes = Buffer.from(file.base64, 'base64');
    if (bytes.length > MAX_FILE_BYTES) throw new AnalysisError(413, 'file_too_large', 'Choose a file that is 2 MB or smaller.');
    if (file.type === 'application/pdf') {
      source = 'PDF';
      if (bytes.subarray(0, 5).toString() !== '%PDF-') {
        throw new AnalysisError(422, 'invalid_pdf', 'This file could not be read as a PDF. Try exporting it again or paste the resume text.');
      }
      try {
        value = await extractPdf(bytes);
      } catch (error) {
        if (error instanceof AnalysisError) throw error;
        throw new AnalysisError(422, 'invalid_pdf', 'This PDF could not be read. Try exporting it again or paste the resume text.');
      }
    } else {
      source = 'text file';
      try {
        value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (value.includes('\0')) throw new Error('Unexpected null byte');
      } catch {
        throw new AnalysisError(422, 'invalid_text', 'Choose a UTF-8 text file or paste your resume.');
      }
    }
  }
  if (typeof value !== 'string' || !/[\p{L}\p{N}]/u.test(value)) {
    throw new AnalysisError(422, 'no_readable_text', 'No readable resume text was found. For a scanned PDF, paste the text or upload a text-based export.');
  }
  if (value.length > MAX_RESUME_CHARS) {
    throw new AnalysisError(413, 'resume_too_long', 'Keep the extracted resume under 30,000 characters.');
  }
  return { source, lines: value.replace(/\r\n?/g, '\n').split('\n') };
}

function createHandler({ verifyToken, extractPdf, generate }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const fail = (error) => res.status(error.status).json({
      status: 'failed', error: { code: error.code, message: error.message, retryable: error.retryable },
    });
    if (req.method !== 'POST') return fail(new AnalysisError(405, 'method', 'Use POST.'));
    const token = /^Bearer (\S+)$/.exec(req.get('authorization') || '')?.[1];
    try {
      if (!token || !(await verifyToken(token))?.uid) throw new Error('Invalid identity');
    } catch {
      return fail(new AnalysisError(401, 'unauthorized', 'A verified Firebase session is required.'));
    }
    const body = req.body ?? {};
    if (typeof body !== 'object' || Array.isArray(body) || 'filePath' in body || 'userId' in body) {
      return fail(new AnalysisError(400, 'unsupported_input', 'Submit resume text or file bytes directly.'));
    }
    const job = typeof body.jobDescription === 'string' ? body.jobDescription.trim() : '';
    if (!job || job.length > MAX_JOB_CHARS) {
      return fail(new AnalysisError(400, 'invalid_vacancy', 'Enter a job description of up to 12,000 characters.'));
    }
    try {
      const { source, lines } = await readResume(body, extractPdf);
      const report = parseReport(await generate(lines, job), lines, job);
      return res.json({
        status: 'completed',
        parsing: { source, lineCount: lines.filter((line) => line.trim()).length },
        original: lines.join('\n'),
        report,
      });
    } catch (error) {
      if (error instanceof AnalysisError) return fail(error);
      return fail(new AnalysisError(503, 'analysis_unavailable', 'The analysis service is temporarily unavailable. Please retry.', true));
    }
  };
}

module.exports = { AnalysisError, createHandler, parseReport, readResume, MAX_FILE_BYTES };
