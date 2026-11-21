const { GoogleGenAI } = require('@google/genai');
const { onRequest } = require('firebase-functions/v2/https');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

function geminiRequest(handler) {
  if (!getApps().length) initializeApp();
  return onRequest({
    memory: '1GiB',
    timeoutSeconds: 120,
    region: 'us-central1',
    cors: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map((origin) => origin.trim()),
  }, handler((token) => getAuth().verifyIdToken(token)));
}

function geminiModel() {
  const client = new GoogleGenAI({
    vertexai: true,
    project: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.VERTEX_LOCATION || 'global',
    httpOptions: { timeout: 20_000 },
  });
  const model = process.env.VERTEX_MODEL || 'gemini-3.8-flash';
  return (request) => client.models.generateContent({ ...request, model });
}

module.exports = { geminiRequest, geminiModel };
