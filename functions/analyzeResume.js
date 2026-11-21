const { createHandler } = require('./evidence');
const { extractPdf } = require('./extractPdf');
const { geminiModel, geminiRequest } = require('./gemini');
const { runAgent } = require('./applicationAgent');

module.exports = geminiRequest((verifyToken) => createHandler({
  verifyToken,
  extractPdf,
  generate: (lines, vacancy) => runAgent({
    model: geminiModel(), lines, vacancy, analysis: true, message: 'Compare the supplied resume with the vacancy.',
  }),
}));
