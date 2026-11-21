import type { CompletedAnalysis } from './application';

const lines = [
  'Maya Chen',
  'Backend Engineer',
  'maya@example.com',
  '',
  'EXPERIENCE',
  'Backend Engineer | Northline Labs | 2022–Present',
  '• Worked on Kafka consumers for billing events and added retry handling.',
  '• Mentored two engineers and led weekly architecture reviews.',
  '• Maintained PostgreSQL services and wrote on-call runbooks.',
  '',
  'SKILLS',
  'Kafka, PostgreSQL, TypeScript',
];

export const sampleResume = lines.join('\n');
export const sampleJob = `Senior Backend Engineer

Build and operate the billing platform. We are looking for:

Kafka experience
Terraform infrastructure experience
Technical leadership across multiple teams`;

export const sampleReport: CompletedAnalysis = {
  status: 'completed',
  original: sampleResume,
  parsing: { source: 'sample text', lineCount: 10 },
  report: {
    requirements: [
      { requirement: 'Kafka experience', finding: 'supported', evidence: [{ line: 7, text: lines[6] }] },
      { requirement: 'Terraform infrastructure experience', finding: 'not_demonstrated', evidence: [] },
      { requirement: 'Technical leadership across multiple teams', finding: 'review', evidence: [{ line: 8, text: lines[7] }] },
    ],
    feedback: [
      'Lead the Kafka bullet with the billing work and keep the retry detail in the same sentence.',
      'If you led work across teams, describe which teams were involved and what you led.',
    ],
    rewrites: [{
      line: 7,
      original: lines[6],
      proposed: '• Added retry handling to Kafka consumers for billing events.',
      facts: [{ line: 7, text: lines[6] }],
      claimsToConfirm: [],
      newTerms: ['to'],
    }],
  },
};
