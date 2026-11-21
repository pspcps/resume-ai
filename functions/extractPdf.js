const { PDFParse } = require('pdf-parse');
const { AnalysisError } = require('./evidence');

async function extractPdf(bytes) {
  const parser = new PDFParse({ data: bytes });
  try {
    const info = await parser.getInfo();
    if (info.total > 12) throw new AnalysisError(413, 'too_many_pages', 'Choose a PDF with no more than 12 pages.');
    return (await parser.getText({ pageJoiner: '' })).text;
  } finally {
    await parser.destroy();
  }
}

module.exports = { extractPdf };
