const headings: Record<string, string> = {
  SUMMARY: 'summary',
  'PROFESSIONAL SUMMARY': 'summary',
  EXPERIENCE: 'experience',
  'WORK EXPERIENCE': 'experience',
  'PROFESSIONAL EXPERIENCE': 'experience',
  SKILLS: 'skills',
  'TECHNICAL SKILLS': 'skills',
};

export function psDevToolDraft(text: string) {
  const [name = '', title = '', ...lines] = text.trim().split('\n');
  const content = {
    name: name.trim(), title: title.trim(), email: '', phone: '', linkedin: '', github: '', portfolio: '',
    summary: '', skills: [] as string[][],
    experience: [] as { role: string; company: string; period: string; bullets: string[] }[],
    projects: [], education: { degree: '', period: '', institution: '', location: '' },
    certification: '', contributions: [] as { text: string; url: null }[],
  };
  const unstructured: string[] = [];
  let section = '';
  let experience: (typeof content.experience)[number] | undefined;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[A-Z][A-Z &]+$/.test(line)) {
      section = headings[line] ?? '';
      experience = undefined;
      if (!section) unstructured.push(line);
      continue;
    }
    if (!section && !content.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(line)) {
      content.email = line;
      continue;
    }
    if (section === 'experience') {
      const parts = line.split('|').map((part) => part.trim());
      if (parts.length === 3 && parts.every((part) => part.length > 0 && part.length <= 20_000) && content.experience.length < 100) {
        const [role, company, period] = parts;
        experience = { role, company, period, bullets: [] };
        content.experience.push(experience);
        continue;
      }
      if (experience && experience.bullets.length < 100 && line.length <= 20_000 && /^[•*-]\s+/.test(line)) {
        experience.bullets.push(line.replace(/^[•*-]\s+/, ''));
        continue;
      }
      experience = undefined;
    }
    if (section === 'skills' && content.skills.length < 100 && line.length <= 20_000) {
      const separator = line.indexOf(':');
      content.skills.push(separator > 0
        ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
        : ['Skills', line]);
      continue;
    }
    unstructured.push(line);
  }
  // PSDevTool limits each field to 20,000 characters. Keep excess content in
  // printable additional entries, and retain the complete text for round trips.
  const split = (value: string) => Array.from(value).reduce<string[]>((chunks, character) => {
    if (!chunks.length || chunks[chunks.length - 1].length + character.length > 20_000) chunks.push('');
    chunks[chunks.length - 1] += character;
    return chunks;
  }, []);
  for (const field of ['name', 'title'] as const) {
    if (content[field].length > 20_000) {
      const [first, ...rest] = split(content[field]);
      content[field] = first;
      unstructured.unshift(...rest);
    }
  }
  const [summary = '', ...overflow] = split(unstructured.join('\n'));
  content.summary = summary;
  content.contributions = overflow.map((value) => ({ text: value, url: null }));
  return {
    version: 1,
    content,
    appearance: { accent: '', text: '#17201c', background: '#ffffff', showQR: false },
    resumeAi: { text },
  };
}
