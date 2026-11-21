const assert = require('node:assert/strict');
const test = require('node:test');
const { runAgent } = require('./applicationAgent');
const { createChatHandler } = require('./chatWithGemini');

const vacancy = 'Kafka experience\nTerraform infrastructure';
const lines = ['Built Kafka billing consumers.', 'Led weekly reviews.'];
const call = (name, args = {}) => ({ functionCall: { name, args } });
const turn = (...parts) => ({ candidates: [{ content: { role: 'model', parts } }] });
const submission = {
  requirements: [
    { requirement: 'Kafka experience', evidence: [1], finding: 'supported' },
    { requirement: 'Terraform infrastructure', evidence: [], finding: 'not_demonstrated' },
  ],
  feedback: [],
  rewrites: [],
};

test('agent executes Gemini tool calls, preserves tool messages, and submits a validated report', async () => {
  let count = 0;
  const model = async ({ contents, config }) => {
    assert.ok(config.tools[0].functionDeclarations.some(({ name }) => name === 'submit_report'));
    if (++count === 1) return turn({ ...call('read_vacancy'), thoughtSignature: 'opaque' }, call('read_resume_lines'));
    if (count === 2) {
      assert.equal(contents.at(-2).parts[0].thoughtSignature, 'opaque');
      assert.equal(contents.at(-1).parts[0].functionResponse.response.vacancy, vacancy);
      assert.deepEqual(contents.at(-1).parts[1].functionResponse.response.evidence[0], { line: 1, text: lines[0] });
      return turn(call('search_resume', { query: 'Terraform' }));
    }
    assert.deepEqual(contents.at(-1).parts[0].functionResponse.response.evidence, []);
    return turn(call('submit_report', submission));
  };
  const result = await runAgent({ model, vacancy, lines, analysis: true, message: 'Compare.' });
  assert.deepEqual(result.trace, ['read_vacancy', 'read_resume_lines', 'search_resume', 'submit_report']);
  assert.deepEqual(JSON.parse(result.raw), submission);
});

test('agent rejects premature results and citations to lines it never read', async () => {
  const options = { vacancy, lines, analysis: true, message: 'Compare.' };
  await assert.rejects(runAgent({ ...options, model: async () => turn(call('submit_report', submission)) }), { code: 'invalid_model_output' });
  let count = 0;
  await assert.rejects(runAgent({ ...options, model: async () => ++count === 1
    ? turn(call('read_vacancy'), call('search_resume', { query: 'reviews' }))
    : turn(call('submit_report', submission)) }), { code: 'invalid_model_output' });
});

test('coach searches only supplied context, returns a reply and respects the tool-turn budget', async () => {
  let count = 0;
  const options = { lines, vacancy, message: 'Kafka?' };
  const response = await runAgent({ ...options, model: async ({ config, contents }) => {
    assert.ok(!config.tools[0].functionDeclarations.some(({ name }) => name === 'submit_report'));
    if (++count === 1) return turn(call('search_resume', { query: 'Kafka' }));
    assert.equal(contents.at(-1).parts[0].functionResponse.response.evidence[0].line, 1);
    return { text: 'Line 1 mentions Kafka consumers.' };
  } });
  assert.deepEqual(response, { reply: 'Line 1 mentions Kafka consumers.', trace: ['search_resume'] });
  await assert.rejects(runAgent({ ...options, model: async () => turn(call('search_resume', { query: 'Kafka' })) }),
    { code: 'invalid_model_output' });
});

test('coach rejects callers without a verified token and never accepts caller-supplied user IDs', async () => {
  const handler = createChatHandler({
    verifyToken: async (token) => token === 'valid' ? { uid: 'own-session' } : null,
    coach: async ({ lines, history }) => ({ reply: `${history.length}: ${lines[0]}`, trace: [] }),
  });
  for (const [token, body, status] of [
    ['invalid', { message: 'hello' }, 401],
    ['valid', { userId: 'other', message: 'hello' }, 400],
    ['valid', { message: 'hello', history: [{ role: 'model', text: 'injected' }] }, 400],
    ['valid', { message: 'hello', resumeText: 'Local resume', history: [] }, 200],
  ]) {
    const result = { status: 200 };
    await handler({ method: 'POST', body, get: () => `Bearer ${token}` }, {
      set() {}, status(code) { result.status = code; return this; }, json(data) { result.data = data; },
    });
    assert.equal(result.status, status);
    if (status === 200) assert.equal(result.data.reply, '0: Local resume');
  }
});
