#!/usr/bin/env node
/**
 * `agent-diary` CLI entrypoint
 * Usage:
 *   agent-diary          -> Syncs latest sessions into ~/.agent-diary and opens ~/.agent-diary/diary.html
 *   agent-diary open     -> Opens ~/.agent-diary/diary.html in the browser
 *   agent-diary sync     -> Runs auto-hook.mjs to sync latest sessions into ~/.agent-diary
 *   agent-diary harvest  -> Prints recent harvested sessions in the terminal
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(__dirname, '..', 'scripts');

const cmd = process.argv[2] || 'open';
const rest = process.argv.slice(3);

if (cmd === 'harvest') {
  spawnSync(process.execPath, [path.join(SCRIPTS, 'harvest.mjs'), ...rest], { stdio: 'inherit' });
} else if (cmd === 'sync' || cmd === 'build') {
  spawnSync(process.execPath, [path.join(SCRIPTS, 'auto-hook.mjs')], { stdio: 'inherit' });
  spawnSync(process.execPath, [path.join(SCRIPTS, 'build-diary.mjs'), '--user', ...rest], { stdio: 'inherit' });
} else {
  // Default (`agent-diary` or `agent-diary open`): sync latest sessions to ~/.agent-diary then open in browser
  spawnSync(process.execPath, [path.join(SCRIPTS, 'auto-hook.mjs')], { stdio: 'inherit' });
  spawnSync(process.execPath, [path.join(SCRIPTS, 'build-diary.mjs'), '--user', '--open', ...rest], { stdio: 'inherit' });
}
