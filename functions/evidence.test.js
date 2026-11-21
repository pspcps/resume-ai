const assert = require('node:assert/strict');
const test = require('node:test');
const { createHandler, parseReport, MAX_FILE_BYTES } = require('./evidence');
const { extractPdf } = require('./extractPdf');

const resumeText = 'Built Kafka billing consumers.\nMentored two engineers.';
const jobDescription = 'Kafka experience and technical leadership';
const model = {
  requirements: [{ requirement: 'Kafka experience', evidence: [1], finding: 'supported' }],
  feedback: [],
  rewrites: [{ line: 1, proposed: 'Built Kafka billing consumers at Acme in 2024.', facts: [1], introduced: ['Acme', '2024'] }],
};

function makePdf(pageContent, resources = '<< >>', extraObjects = []) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources ${resources} >>`,
    `<< /Length ${pageContent.length} >>\nstream\n${pageContent}\nendstream`,
    ...extraObjects,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return Buffer.from(pdf + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`, 'ascii');
}

function pdfBody(bytes) {
  return { jobDescription, file: { type: 'application/pdf', base64: bytes.toString('base64') } };
}

async function request(body, { token = 'verified', generate = async () => JSON.stringify(model) } = {}) {
  const result = { code: 200 };
  const handler = createHandler({
    verifyToken: async (value) => {
      if (value !== 'verified') throw new Error('Invalid token');
      return { uid: 'alice' };
    },
    extractPdf,
    generate,
  });
  await handler({
    method: 'POST', body, get: () => token && `Bearer ${token}`,
  }, {
    set() {},
    status(code) { result.code = code; return this; },
    json(payload) { result.payload = payload; },
  });
  return result;
}

test('links evidence to exact source lines and flags introduced terms', () => {
  const result = parseReport(JSON.stringify(model), resumeText.split('\n'), jobDescription);
  assert.deepEqual(result.requirements[0].evidence, [{ line: 1, text: 'Built Kafka billing consumers.' }]);
  assert.deepEqual(result.rewrites[0].claimsToConfirm, ['Acme', '2024']);
  assert.ok(result.rewrites[0].newTerms.some((word) => word.startsWith('2024')));
});

test('malformed JSON, invalid shape and unsupported citations are retryable failures', async () => {
  const cases = ['{', '{}',
    JSON.stringify({ ...model, requirements: [{ ...model.requirements[0], evidence: [9] }] }),
    JSON.stringify({ ...model, requirements: [{ ...model.requirements[0], requirement: 'Invented vacancy' }] }),
    JSON.stringify({ ...model, requirements: [{ ...model.requirements[0], evidence: [] }] }),
    JSON.stringify({ ...model, rewrites: [{ ...model.rewrites[0], facts: [2] }] }),
  ];
  for (const raw of cases) {
    const result = await request({ resumeText, jobDescription }, { generate: async () => raw });
    assert.equal(result.code, 502);
    assert.equal(result.payload.status, 'failed');
    assert.equal(result.payload.error.retryable, true);
    assert.equal(result.payload.report, undefined);
  }
});

test('rejects unverified requests and never reads a caller-supplied object path', async () => {
  const inputs = [
    [{ resumeText, jobDescription }, { token: '' }, 401],
    [{ filePath: 'uploads/bob/private.pdf', jobDescription }, { token: 'invalid' }, 401],
    [{ filePath: 'uploads/bob/private.pdf', jobDescription }, {}, 400],
    [{ resumeText, jobDescription, userId: 'bob' }, {}, 400],
  ];
  for (const [body, options, code] of inputs) {
    let called = false;
    const result = await request(body, { ...options, generate: async () => { called = true; } });
    assert.equal(result.code, code);
    assert.equal(called, false);
  }
});

test('empty and image-only PDFs produce a readable-text error without contacting the model', async () => {
  const imageOnly = makePdf('q 100 0 0 100 0 0 cm /Scan Do Q', '<< /XObject << /Scan 5 0 R >> >>', [
    '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 3 >>\nstream\n00>\nendstream',
  ]);
  for (const fixture of [makePdf(''), imageOnly]) {
    let called = false;
    const result = await request(pdfBody(fixture), { generate: async () => { called = true; } });
    assert.equal(result.code, 422);
    assert.equal(result.payload.error.code, 'no_readable_text');
    assert.equal(called, false);
  }
});

test('a text PDF returns a completed report with readable lines', async () => {
  const result = await request(pdfBody(makePdf(
    'BT /F1 12 Tf 20 150 Td (Built Kafka billing consumers.) Tj ET',
    '<< /Font << /F1 5 0 R >> >>',
    ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],
  )));
  assert.equal(result.code, 200, JSON.stringify(result));
  assert.equal(result.payload.status, 'completed');
  assert.equal(result.payload.parsing.source, 'PDF');
  assert.equal(result.payload.parsing.lineCount, 1);
});

test('enforces the file limit and surfaces upstream errors separately', async () => {
  assert.equal((await request(pdfBody(Buffer.alloc(MAX_FILE_BYTES + 1)))).code, 413);
  const result = await request({ resumeText, jobDescription }, { generate: async () => { throw Error('provider down'); } });
  assert.equal(result.code, 503);
  assert.equal(result.payload.error.retryable, true);
});
