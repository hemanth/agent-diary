#!/usr/bin/env node
/**
 * agent-diary HTML & Markdown compiler
 * - Default (`npm run build`): compiles repo demo data/diary-entries.json into diary.html, docs/index.html, and DIARY.md
 * - With `--user`: compiles personal ~/.agent-diary/diary-entries.json into ~/.agent-diary/diary.html and ~/.agent-diary/DIARY.md
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'resources', 'template.html');

function generateMarkdown(entries) {
  const lines = [
    '# Agent Diary · Τὰ εἰς ἑαυτόν (Engineering & Stoic Journal)',
    '',
    '> Distilled learnings, technical challenges, root-cause solutions, user reflections, and Marcus Aurelius meditations across AI agent sessions.',
    ''
  ];

  for (const e of entries) {
    lines.push(`## [${e.date}] \`${e.project}\`: ${e.title}`);
    lines.push(`- **Session**: \`${(e.sessionId || '').slice(0, 8)}\` · **Workspace**: \`${e.workspace || ''}\` · **Virtue**: *${e.virtue || ''}*`);
    lines.push(`- **Summary**: ${e.summary}`);
    lines.push('');
    lines.push('### I. The obstacle (Challenges)');
    for (const c of e.challenges || []) lines.push(`- ${c}`);
    lines.push('');
    lines.push('### II. The fix (Solutions)');
    for (const s of e.solutions || []) lines.push(`- ${s}`);
    lines.push('');
    lines.push('### III. New learnings');
    for (const l of e.learnings || []) lines.push(`- ${l}`);
    lines.push('');
    if (e.meditation) {
      lines.push(`### IV. Ta Eis Heauton (${e.meditation.book}, ${e.meditation.verse} · ${e.meditation.stoicConcept})`);
      lines.push(`> *"${e.meditation.quote}"*`);
      lines.push('');
      lines.push(e.meditation.reflection);
      lines.push('');
    }
    if (e.userNote) {
      lines.push(`### V. User's note`);
      lines.push(`*"${e.userNote}"*`);
      lines.push('');
    }
    lines.push('---', '');
  }

  return lines.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  const shouldOpen = argv.includes('--open');
  const useUserDir = argv.includes('--user');
  const addJsonIdx = argv.indexOf('--add-json');

  const userDir = path.join(os.homedir(), '.agent-diary');
  if (useUserDir) {
    fs.mkdirSync(userDir, { recursive: true });
    const userJson = path.join(userDir, 'diary-entries.json');
    if (!fs.existsSync(userJson)) {
      fs.copyFileSync(path.join(ROOT, 'data', 'diary-entries.json'), userJson);
    }
  }

  const dataPath = useUserDir
    ? path.join(userDir, 'diary-entries.json')
    : path.join(ROOT, 'data', 'diary-entries.json');
  const outHtml = useUserDir
    ? path.join(userDir, 'diary.html')
    : path.join(ROOT, 'diary.html');
  const outMd = useUserDir
    ? path.join(userDir, 'DIARY.md')
    : path.join(ROOT, 'DIARY.md');

  const entries = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  if (addJsonIdx !== -1 && argv[addJsonIdx + 1]) {
    const newEntry = JSON.parse(argv[addJsonIdx + 1]);
    const existingIdx = entries.findIndex((e) => e.id === newEntry.id);
    if (existingIdx !== -1) {
      entries[existingIdx] = newEntry;
    } else {
      entries.unshift(newEntry);
    }
    fs.writeFileSync(dataPath, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  }

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const html = template.replace(
    '/*__DIARY_ENTRIES_JSON__*/[]',
    JSON.stringify(entries, null, 2)
  );

  fs.writeFileSync(outHtml, html, 'utf8');
  fs.writeFileSync(outMd, generateMarkdown(entries), 'utf8');

  if (!useUserDir) {
    const outDocsHtml = path.join(ROOT, 'docs', 'index.html');
    fs.mkdirSync(path.dirname(outDocsHtml), { recursive: true });
    fs.writeFileSync(outDocsHtml, html, 'utf8');
  }

  console.log(`✓ Compiled ${entries.length} entries into:`);
  console.log(`  - ${outHtml}`);
  if (!useUserDir) {
    console.log(`  - ${path.join(ROOT, 'docs', 'index.html')}`);
  }
  console.log(`  - ${outMd}`);

  if (shouldOpen) {
    try {
      execSync(`open "${outHtml}"`);
    } catch {}
  }
}

main();
