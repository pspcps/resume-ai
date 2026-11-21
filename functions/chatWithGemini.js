const { AnalysisError, createVerifiedHandler, MAX_RESUME_CHARS, MAX_JOB_CHARS } = require('./evidence');
const { geminiModel, geminiRequest } = require('./gemini');
const { runAgent } = require('./applicationAgent');

function createChatHandler({ verifyToken, coach }) {
  return createVerifiedHandler(verifyToken, async ({ message, history = [], resumeText = '', jobDescription = '' }) => {
    if (typeof message !== 'string' || !message.trim() || message.length > 1_000
        || typeof resumeText !== 'string' || resumeText.length > MAX_RESUME_CHARS
        || typeof jobDescription !== 'string' || jobDescription.length > MAX_JOB_CHARS
        || !Array.isArray(history) || history.length > 8 || history.length % 2 !== 0
        || !history.every((entry, index) => entry && entry.role === (index % 2 === 0 ? 'user' : 'model')
          && typeof entry.text === 'string' && entry.text.trim() && entry.text.length <= 4_000)) {
      throw new AnalysisError(400, 'invalid_chat', 'Enter a question of up to 1,000 characters.');
    }
    return {
      status: 'completed',
      ...await coach({ message: message.trim(), history, vacancy: jobDescription, lines: resumeText.split('\n') }),
    };
  });
}

module.exports = geminiRequest((verifyToken) => createChatHandler({
  verifyToken, coach: (options) => runAgent({ ...options, model: geminiModel() }),
}));
module.exports.createChatHandler = createChatHandler;
