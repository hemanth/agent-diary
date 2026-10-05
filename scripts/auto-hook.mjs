#!/usr/bin/env node
/**
 * agent-diary automatic lifecycle hook & background sync
 * Triggered on Antigravity `Stop` and Claude Code `Stop` hooks.
 * Automatically harvests new or updated agent sessions (Antigravity + Claude Code)
 * into data/diary-entries.json and recompiles diary.html, docs/index.html, and DIARY.md
 * without overwriting curated entries or user margin notes.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HOME = os.homedir();
const USER_DIR = path.join(HOME, '.agent-diary');
const DATA_PATH = path.join(USER_DIR, 'diary-entries.json');
const SEED_PATH = path.join(ROOT, 'data', 'diary-entries.json');
const BUILD_SCRIPT = path.join(__dirname, 'build-diary.mjs');
const BRAIN_DIR = path.join(HOME, '.gemini', 'antigravity-cli', 'brain');
const CLAUDE_DIR = path.join(HOME, '.claude', 'projects');

const STOIC_ARCHETYPES = [
  {
    match: /error|bug|fail|fix|crash|undefined|null|exception|rank|mismatch/i,
    virtue: 'Truth & Verification (Alētheia)',
    book: 'Book IV',
    verse: '§ 29',
    stoicConcept: 'Katalepsis (Grasping the True Cause)',
    quote: (proj) => `When ${proj} throws an error at the gate, do not blame the runtime; inspect the assumption that preceded the call.`,
    reflection: (proj, ch) => `In ${proj}, friction arose when "${ch}". The Stoic does not wish for a compiler that forgives broken invariants; he uses the strictness of the failure to uncover the exact boundary where opinion diverged from reality.`
  },
  {
    match: /slow|perf|latency|wasm|webgpu|fast|prune|cache|memory|swap/i,
    virtue: 'Economy & Precision (Euteleia)',
    book: 'Book IV',
    verse: '§ 24',
    stoicConcept: 'Apallagē (Stripping Away the Superfluous)',
    quote: (proj) => `Ask of every cycle and every byte in ${proj}: 'Are you necessary?' Eliminate what is redundant, and speed follows of its own accord.`,
    reflection: (proj, ch) => `While working on ${proj}, we hit "${ch}". Marcus reminded himself daily that clear action comes from doing less, cutting unnecessary copies, round-trips, and idle weights.`
  },
  {
    match: /ui|css|layout|mobile|responsive|video|render|frame|canvas|design/i,
    virtue: 'Temperance & Proportion (Sophrosyne)',
    book: 'Book VI',
    verse: '§ 16',
    stoicConcept: 'Metron (Measure & Proportion)',
    quote: (proj) => `Beauty in ${proj} asks for no ornament beyond proportion: each element fitted to its viewport, nothing overflowing its measure.`,
    reflection: (proj, ch) => `In ${proj}, the challenge was "${ch}". What looks harmonious in one frame clips or collapses in another unless governed by true ratio and restraint.`
  },
  {
    match: /network|api|oauth|mcp|auth|router|socket|http|dns|sync/i,
    virtue: 'Perseverance (Karteria)',
    book: 'Book VIII',
    verse: '§ 35',
    stoicConcept: 'Sympatheia & Protocol Discipline',
    quote: (proj) => `No service stands alone: ${proj} speaks across boundaries governed by strict contracts. Honor the protocol, verify the wire, and the gate opens.`,
    reflection: (proj, ch) => `Across the boundary of ${proj}, we met "${ch}". External systems and protocols are outside our direct will (aprohaireta); our sole domain is how accurately we probe, authenticate, and verify them.`
  },
  {
    match: /.*/,
    virtue: 'Wisdom (Sophia)',
    book: 'Book V',
    verse: '§ 20',
    stoicConcept: 'Hupokeimena (The Obstacle is the Way)',
    quote: (proj) => `The mind adapts and converts to its own purposes the obstacle to our acting in ${proj}. What stood in the way becomes the way.`,
    reflection: (proj, ch) => `Every session in ${proj} begins as an unformed intention and meets resistance ("${ch}"). By recording the obstacle and the craft that resolved it, today's struggle becomes tomorrow's ready tool.`
  }
];

function cleanUserPrompt(raw) {
  if (!raw || typeof raw !== 'string') return '';
  if (/^Base directory for this skill:/i.test(raw.trim())) return '';
  const m = raw.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/i);
  const text = (m ? m[1] : raw)
    .replace(/<command-[^>]+>[\s\S]*?<\/command-[^>]+>/g, '')
    .replace(/<local-command-[^>]+>[\s\S]*?<\/local-command-[^>]+>/g, '')
    .replace(/[—–]/g, ', ')
    .replace(/[“”]/g, '"')
    .replace(/’/g, "'")
    .trim();
  if (!text || /^Base directory for this skill:/i.test(text) || /^\[Request interrupted/i.test(text)) {
    return '';
  }
  if (/^https?:\/\/\S+$/i.test(text)) {
    return '';
  }
  if (text.startsWith('# Live UI Feedback Request')) {
    return 'Live UI Feedback and Visual Annotation Refinement';
  }
  return text.replace(/\s+/g, ' ').slice(0, 240);
}

function stripMarkdown(str) {
  return String(str || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_>`~]/g, '')
    .replace(/[—–]/g, ', ')
    .replace(/[“”]/g, '"')
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function buildEntryFromSignals({
  sessionId,
  runtime,
  stepCount,
  createdAt,
  project,
  workspace,
  userPrompts,
  challenges,
  solutions,
  learnings,
  lastPlannerText,
  tags
}) {
  const combinedText = `${project} ${userPrompts.join(' ')} ${challenges.join(' ')} ${solutions.join(' ')}`;
  const archetype = STOIC_ARCHETYPES.find((a) => a.match.test(combinedText)) || STOIC_ARCHETYPES[STOIC_ARCHETYPES.length - 1];

  const dateObj = createdAt ? new Date(createdAt) : new Date();
  const dateStr = dateObj.toISOString().slice(0, 10);
  const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' PDT';

  const rawTitle = userPrompts[0].replaceAll(os.homedir(), "~")
    .replace(/^(let us|let's|can you|can we|please|create a|build a)\s+/i, '')
    .slice(0, 72);
  const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);

  return {
    id: `entry-${dateStr}-${project}-${sessionId.slice(0, 6)}`,
    sessionId,
    autoSynced: true,
    stepCount,
    date: dateStr,
    time: timeStr,
    project,
    workspace: (workspace || `~/labs/${project}`).replace(os.homedir(), "~"),
    agent: `${runtime} (Auto-Hook)`,
    title,
    summary: stripMarkdown(lastPlannerText || solutions[0] || title).slice(0, 210),
    tags: [...tags].slice(0, 5),
    virtue: archetype.virtue,
    challenges: [...new Set(challenges)].slice(0, 3),
    solutions: [...new Set(solutions)].slice(0, 3),
    learnings: [...new Set(learnings)].slice(0, 3),
    meditation: {
      book: archetype.book,
      verse: archetype.verse,
      location: `Auto-inscribed by Stop hook in ${project}`,
      stoicConcept: archetype.stoicConcept,
      quote: archetype.quote(project),
      reflection: archetype.reflection(project, (challenges[0] || title).replace(/`/g, ''))
    },
    userNote: ''
  };
}

function parseAntigravityTranscript(sessionId, tPath) {
  if (!fs.existsSync(tPath)) return null;
  const lines = fs.readFileSync(tPath, 'utf8').split('\n').filter(Boolean);
  if (lines.length < 4) return null;

  const userPrompts = [];
  const challenges = [];
  const solutions = [];
  const learnings = [];
  const filesTouched = new Set();
  const cwds = new Set();
  const tags = new Set(['auto-hook']);
  let createdAt = null;
  let lastPlannerText = '';

  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!createdAt && obj.created_at) createdAt = obj.created_at;

    if (obj.type === 'USER_INPUT') {
      const cleaned = cleanUserPrompt(obj.content);
      if (cleaned) {
        userPrompts.push(cleaned);
        if (userPrompts.length > 1 && /\?|why|not|doesn't|error|fail|slow|broken|check|fix|how/i.test(cleaned)) {
          challenges.push(`User inquiry/challenge: "${cleaned.slice(0, 150)}"`);
        }
      }
    } else if (obj.type === 'PLANNER_RESPONSE') {
      if (typeof obj.content === 'string' && obj.content.trim().length > 30) {
        lastPlannerText = obj.content.trim();
      }
      if (Array.isArray(obj.tool_calls)) {
        for (const tc of obj.tool_calls) {
          const args = tc.args || {};
          const cwd = typeof args.Cwd === 'string' ? args.Cwd.replace(/^"|"$/g, '') : '';
          if (cwd) cwds.add(cwd);

          const targetFile = typeof args.TargetFile === 'string' ? args.TargetFile.replace(/^"|"$/g, '') : '';
          if (targetFile && !targetFile.includes('/.gemini/')) {
            filesTouched.add(path.basename(targetFile));
          }

          const desc = typeof args.Description === 'string' ? args.Description.replace(/^"|"$/g, '') : '';
          if (desc && solutions.length < 4) {
            solutions.push(desc);
          }
        }
      }
    } else if (obj.type === 'GENERIC' && typeof obj.content === 'string') {
      if (obj.content.includes('exited with code 1') || /Error:|Exception:|ERR_/i.test(obj.content)) {
        const errLine = obj.content
          .split('\n')
          .map((l) => l.trim())
          .find((l) => /Error:|Exception:|ERR_|failed|invalid|denied/i.test(l) && l.length > 12);
        if (errLine && challenges.length < 4) {
          challenges.push(`Runtime diagnostic: \`${errLine.slice(0, 130)}\``);
        }
      }
    }
  }

  if (userPrompts.length === 0 || !lastPlannerText) return null;

  const workspaceList = [...cwds];
  const primaryWorkspace =
    workspaceList.find((w) => !w.includes('/.gemini') && !w.includes('/Downloads')) ||
    '';

  if (!primaryWorkspace) return null;

  const project = path.basename(primaryWorkspace);
  tags.add(project);
  for (const f of [...filesTouched].slice(0, 3)) {
    const ext = path.extname(f).replace('.', '');
    if (ext) tags.add(ext);
  }

  const bulletLines = lastPlannerText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+\*\*|\d+\.\s+\*\*/.test(l))
    .map((l) => stripMarkdown(l.replace(/^[-*\d.]+\s*/, '')).slice(0, 180))
    .filter((l) => l.length > 25);

  if (solutions.length === 0 && bulletLines.length > 0) {
    solutions.push(...bulletLines.slice(0, 3));
  }
  if (solutions.length === 0 && filesTouched.size > 0) {
    solutions.push(`Updated and verified ${[...filesTouched].slice(0, 5).map((f) => `\`${f}\``).join(', ')}.`);
  }
  if (solutions.length === 0) {
    solutions.push(stripMarkdown(lastPlannerText).slice(0, 180));
  }

  if (challenges.length === 0) {
    challenges.push(`Engineering objective: "${userPrompts[0].slice(0, 160)}"`);
  }

  if (bulletLines.length > 1) {
    learnings.push(...bulletLines.slice(-2));
  } else {
    learnings.push(stripMarkdown(lastPlannerText).slice(0, 190));
  }

  return buildEntryFromSignals({
    sessionId,
    runtime: 'Antigravity',
    stepCount: lines.length,
    createdAt,
    project,
    workspace: primaryWorkspace,
    userPrompts,
    challenges,
    solutions,
    learnings,
    lastPlannerText,
    tags
  });
}

function parseClaudeTranscript(sessionId, projectSlug, filePath, mtime) {
  if (!fs.existsSync(filePath)) return null;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  if (lines.length < 6) return null;

  const userPrompts = [];
  const challenges = [];
  const solutions = [];
  let lastAssistantText = '';
  let cwd = '';

  for (const line of lines) {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!cwd && obj.cwd) cwd = obj.cwd;
    if (obj.type === 'user' && obj.message?.content) {
      const raw = typeof obj.message.content === 'string'
        ? obj.message.content
        : Array.isArray(obj.message.content)
          ? obj.message.content.map((c) => c.text || '').join(' ')
          : '';
      const cleaned = cleanUserPrompt(raw);
      if (cleaned && cleaned.length > 5) {
        userPrompts.push(cleaned);
        if (userPrompts.length > 1 && /\?|why|error|fail|fix|how/i.test(cleaned)) {
          challenges.push(`Follow-up refinement: "${cleaned.slice(0, 140)}"`);
        }
      }
    } else if (obj.type === 'assistant' && Array.isArray(obj.message?.content)) {
      for (const block of obj.message.content) {
        if (block.type === 'text' && block.text && block.text.trim().length > 30) {
          lastAssistantText = block.text.trim();
        } else if (block.type === 'tool_use' && block.name) {
          const fileArg = block.input?.file_path || block.input?.path || '';
          if (fileArg && solutions.length < 4) {
            solutions.push(`Executed \`${block.name}\` on \`${path.basename(fileArg)}\``);
          }
        }
      }
    }
  }

  if (userPrompts.length === 0 || !lastAssistantText) return null;
  const project = cwd ? path.basename(cwd) : projectSlug.replace(/^-Users-[^-]+-/, '');
  if (!project || project === 'tmp' || project === path.basename(os.homedir())) return null;

  if (challenges.length === 0) {
    challenges.push(`Initial requirement: "${userPrompts[0].slice(0, 150)}"`);
  }
  if (solutions.length === 0) {
    solutions.push(stripMarkdown(lastAssistantText).slice(0, 180));
  }

  return buildEntryFromSignals({
    sessionId,
    runtime: 'Claude Code',
    stepCount: lines.length,
    createdAt: new Date(mtime).toISOString(),
    project,
    workspace: (cwd || `~/${project}`).replace(os.homedir(), "~"),
    userPrompts,
    challenges,
    solutions,
    learnings: [stripMarkdown(lastAssistantText).slice(0, 190)],
    lastPlannerText: lastAssistantText,
    tags: new Set([project, 'claude-code', 'auto-hook'])
  });
}

function main() {
  fs.mkdirSync(USER_DIR, { recursive: true });
  if (!fs.existsSync(DATA_PATH) && fs.existsSync(SEED_PATH)) {
    fs.copyFileSync(SEED_PATH, DATA_PATH);
  }
  let entries = [];
  try {
    entries = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch {
    return;
  }

  let changed = false;

  // 1. Scan Antigravity sessions
  if (fs.existsSync(BRAIN_DIR)) {
    const recentDirs = fs
      .readdirSync(BRAIN_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => {
        const tPath = path.join(BRAIN_DIR, d.name, '.system_generated', 'logs', 'transcript.jsonl');
        let mtime = 0;
        try {
          mtime = fs.statSync(tPath).mtimeMs;
        } catch {}
        return { sessionId: d.name, tPath, mtime };
      })
      .filter((d) => d.mtime > 0)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 12);

    for (const item of recentDirs) {
      const existingIdx = entries.findIndex((e) => e.sessionId === item.sessionId);
      if (existingIdx !== -1 && !entries[existingIdx].autoSynced) continue;

      const parsed = parseAntigravityTranscript(item.sessionId, item.tPath);
      if (!parsed) continue;

      if (existingIdx !== -1) {
        if ((entries[existingIdx].stepCount || 0) !== parsed.stepCount) {
          parsed.userNote = entries[existingIdx].userNote || '';
          entries[existingIdx] = parsed;
          changed = true;
        }
      } else {
        entries.unshift(parsed);
        changed = true;
      }
    }
  }

  // 2. Scan Claude Code sessions
  if (fs.existsSync(CLAUDE_DIR)) {
    const claudeFiles = [];
    for (const pd of fs.readdirSync(CLAUDE_DIR, { withFileTypes: true })) {
      if (!pd.isDirectory()) continue;
      const pFull = path.join(CLAUDE_DIR, pd.name);
      for (const f of fs.readdirSync(pFull)) {
        if (!f.endsWith('.jsonl')) continue;
        const fFull = path.join(pFull, f);
        try {
          claudeFiles.push({
            sessionId: path.basename(f, '.jsonl'),
            projectSlug: pd.name,
            filePath: fFull,
            mtime: fs.statSync(fFull).mtimeMs
          });
        } catch {}
      }
    }
    claudeFiles.sort((a, b) => b.mtime - a.mtime);

    for (const cf of claudeFiles.slice(0, 5)) {
      const existingIdx = entries.findIndex((e) => e.sessionId === cf.sessionId);
      if (existingIdx !== -1 && !entries[existingIdx].autoSynced) continue;

      const parsed = parseClaudeTranscript(cf.sessionId, cf.projectSlug, cf.filePath, cf.mtime);
      if (!parsed) continue;

      if (existingIdx !== -1) {
        if ((entries[existingIdx].stepCount || 0) !== parsed.stepCount) {
          parsed.userNote = entries[existingIdx].userNote || '';
          entries[existingIdx] = parsed;
          changed = true;
        }
      } else {
        entries.unshift(parsed);
        changed = true;
      }
    }
  }

  if (changed) {
    entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    fs.writeFileSync(DATA_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf8');
    spawnSync(process.execPath, [BUILD_SCRIPT, '--user'], { stdio: 'ignore' });
  }
}

main();
