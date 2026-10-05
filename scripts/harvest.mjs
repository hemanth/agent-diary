#!/usr/bin/env node
/**
 * agent-diary session harvester
 * Scans Antigravity (~/.gemini/antigravity-cli/brain/*), Claude Code (~/.claude/projects/*),
 * and local Git commits to extract prompts, workspaces, friction signals, and outcomes.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const BRAIN_DIR = path.join(HOME, '.gemini', 'antigravity-cli', 'brain');
const CLAUDE_DIR = path.join(HOME, '.claude', 'projects');

function parseArgs(argv) {
  const args = { limit: 15, json: false, source: 'all' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--limit' && argv[i + 1]) args.limit = parseInt(argv[++i], 10) || 15;
    else if (a === '--source' && argv[i + 1]) args.source = argv[++i];
  }
  return args;
}

function cleanUserPrompt(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const m = raw.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/i);
  const text = (m ? m[1] : raw).trim();
  return text.replace(/\s+/g, ' ').slice(0, 280);
}

function scanAntigravitySessions(limit = 15) {
  if (!fs.existsSync(BRAIN_DIR)) return [];
  const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => {
      const fullPath = path.join(BRAIN_DIR, d.name);
      const tPath = path.join(fullPath, '.system_generated', 'logs', 'transcript.jsonl');
      let mtime = 0;
      try {
        mtime = fs.existsSync(tPath) ? fs.statSync(tPath).mtimeMs : fs.statSync(fullPath).mtimeMs;
      } catch {}
      return { id: d.name, fullPath, tPath, mtime };
    })
    .filter((d) => fs.existsSync(d.tPath))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);

  const results = [];

  for (const item of entries) {
    try {
      const content = fs.readFileSync(item.tPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      const userPrompts = [];
      const frictionSignals = [];
      const toolSummaries = [];
      const cwds = new Set();
      let createdAt = null;
      let finalResponse = '';

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
            if (/\?|why|not working|doesn't|error|fail|true|really|broken|down|fix/i.test(cleaned)) {
              frictionSignals.push(`User inquiry/challenge: "${cleaned}"`);
            }
          }
        } else if (obj.type === 'PLANNER_RESPONSE') {
          if (obj.content && typeof obj.content === 'string' && obj.content.trim()) {
            finalResponse = obj.content.trim().replace(/\s+/g, ' ').slice(0, 420);
          }
          if (Array.isArray(obj.tool_calls)) {
            for (const tc of obj.tool_calls) {
              const tcArgs = tc.args || {};
              const rawCwd = typeof tcArgs.Cwd === 'string' ? tcArgs.Cwd.replace(/^"|"$/g, '') : '';
              if (rawCwd) cwds.add(rawCwd);
              const rawSummary = typeof tcArgs.toolSummary === 'string' ? tcArgs.toolSummary.replace(/^"|"$/g, '') : '';
              if (rawSummary && toolSummaries.length < 12) {
                toolSummaries.push(`${tc.name}: ${rawSummary}`);
              }
            }
          }
        } else if (obj.type === 'GENERIC' && typeof obj.content === 'string') {
          if (obj.content.includes('exited with code 1') || obj.content.includes('Error:')) {
            const snippet = obj.content.split('\n').find((l) => /error|exited with code [^0]/i.test(l));
            if (snippet && frictionSignals.length < 8) {
              frictionSignals.push(`Command error: ${snippet.trim().slice(0, 140)}`);
            }
          }
        }
      }

      if (userPrompts.length === 0) continue;

      const workspaceList = [...cwds];
      const primaryWorkspace = workspaceList.find((w) => w.includes('/labs/')) || workspaceList[0] || '';
      const project = primaryWorkspace ? path.basename(primaryWorkspace) : 'general-session';

      results.push({
        runtime: 'Antigravity',
        sessionId: item.id,
        date: createdAt ? createdAt.slice(0, 10) : new Date(item.mtime).toISOString().slice(0, 10),
        timestamp: createdAt || new Date(item.mtime).toISOString(),
        project,
        workspace: primaryWorkspace,
        workspaces: workspaceList,
        userPrompts: userPrompts.slice(0, 6),
        frictionSignals: frictionSignals.slice(0, 5),
        toolSample: toolSummaries.slice(0, 8),
        finalOutcome: finalResponse
      });
    } catch {
      // ignore unreadable transcripts
    }
  }

  return results;
}

function scanClaudeSessions(limit = 5) {
  if (!fs.existsSync(CLAUDE_DIR)) return [];
  const results = [];
  try {
    const projDirs = fs.readdirSync(CLAUDE_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
    const files = [];
    for (const pd of projDirs) {
      const pFull = path.join(CLAUDE_DIR, pd.name);
      const jsonls = fs.readdirSync(pFull).filter((f) => f.endsWith('.jsonl'));
      for (const jf of jsonls) {
        const jfFull = path.join(pFull, jf);
        try {
          files.push({ projectSlug: pd.name, file: jfFull, mtime: fs.statSync(jfFull).mtimeMs });
        } catch {}
      }
    }
    files.sort((a, b) => b.mtime - a.mtime);
    for (const item of files.slice(0, limit)) {
      const raw = fs.readFileSync(item.file, 'utf8').split('\n').filter(Boolean);
      const prompts = [];
      for (const line of raw) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'user' && obj.message?.content) {
            const c = typeof obj.message.content === 'string'
              ? obj.message.content
              : JSON.stringify(obj.message.content);
            prompts.push(c.replace(/\s+/g, ' ').slice(0, 200));
          }
        } catch {}
      }
      if (prompts.length > 0) {
        results.push({
          runtime: 'Claude Code',
          sessionId: path.basename(item.file, '.jsonl'),
          date: new Date(item.mtime).toISOString().slice(0, 10),
          timestamp: new Date(item.mtime).toISOString(),
          project: item.projectSlug.replace(/^-Users-[^-]+-/, ''),
          workspace: item.projectSlug.replace(/-/g, '/'),
          userPrompts: prompts.slice(0, 4),
          frictionSignals: [],
          toolSample: [],
          finalOutcome: ''
        });
      }
    }
  } catch {}
  return results;
}

function main() {
  const args = parseArgs(process.argv);
  const agy = scanAntigravitySessions(args.limit);
  const claude = scanClaudeSessions(Math.max(3, Math.floor(args.limit / 3)));
  const combined = [...agy, ...claude].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || '')).slice(0, args.limit);

  if (args.json) {
    console.log(JSON.stringify(combined, null, 2));
    return;
  }

  console.log(`╔════════════════════════════════════════════════════════════════════════╗`);
  console.log(`║  AGENT DIARY HARVESTER · ${String(combined.length).padStart(2, ' ')} SESSIONS DISCOVERED                        ║`);
  console.log(`╚════════════════════════════════════════════════════════════════════════╝\n`);

  for (const s of combined) {
    console.log(`● [${s.date}] ${s.project.toUpperCase()} (${s.runtime} · ${s.sessionId.slice(0, 8)})`);
    if (s.workspace) console.log(`  Workspace : ${s.workspace}`);
    console.log(`  Initial   : ${s.userPrompts[0] || '(none)'}`);
    if (s.frictionSignals.length > 0) {
      console.log(`  Obstacles : ${s.frictionSignals.join(' | ')}`);
    }
    if (s.finalOutcome) {
      console.log(`  Outcome   : ${s.finalOutcome.slice(0, 180)}...`);
    }
    console.log('');
  }
}

main();
