# agent-diary

Pull learnings, bugs, and fixes from AI agent sessions into a local HTML diary and an interactive Claude Code Mod pane with Marcus Aurelius style notes.

```bash
git clone https://github.com/hemanth/agent-diary.git
cd agent-diary
npm link
ln -s "$PWD" ~/.gemini/config/skills/agent-diary
ln -s "$PWD" ~/.claude/skills/agent-diary
```

## Quick start

```bash
# Scan recent sessions from Antigravity and Claude Code
npm run harvest

# Build and open diary.html
npm run open
```

`harvest.mjs` reads `.jsonl` transcripts for errors, follow-up questions, and fixes. `build-diary.mjs` compiles `data/diary-entries.json` into `diary.html`, `docs/index.html`, and `DIARY.md`.

## Claude Code Mod

`agent-diary` includes a [Claude Code Mod](https://code.claude.com/docs/en/plugins/mods/overview) (`hooks/register.js`) that draws an interactive pane inside your terminal or Claude Desktop app.

```bash
# Load from ~/.claude/skills/agent-diary or pass --plugin-dir directly
claude --plugin-dir .

# Validate and run the mod test suite
npm run validate
npm test
```

Inside a Claude Code session:
- `/diary` opens the interactive `Agent Diary (Ta Eis Heauton)` pane with three tabs: `1: Entries`, `2: Meditations`, and `3: Write Note`.
- `/diary-note <reflection>` saves a personal note straight from the prompt into `$.store` and `data/diary-entries.json`.
- `/diary-open` opens `diary.html` in your browser.
- Hotkeys inside the pane: `1`/`2`/`3` switch tabs, `n`/`p` cycle entries, `m` draws another Stoic meditation lot, `b` toggles the `AbovePrompt` Stoic quote banner, and `o` opens the HTML diary.

## CLI usage

```bash
# Sync latest sessions and open diary.html in your browser
agent-diary

# Print recent sessions in the terminal
agent-diary harvest

# Sync and rebuild without opening a browser tab
agent-diary sync
```

## Add an entry from the terminal

```bash
node scripts/build-diary.mjs --add-json '{
  "id": "entry-2026-10-05-my-project",
  "date": "2026-10-05",
  "project": "my-project",
  "title": "Zero-copy buffers in the audio worker",
  "summary": "Removed redundant ArrayBuffer copies on the hot path.",
  "virtue": "Economy and Precision (Euteleia)",
  "challenges": ["GC pauses hit 45ms when cloning 16MB audio frames."],
  "solutions": ["Passed ownership with postMessage transferable ArrayBuffers."],
  "learnings": ["Transferables move ownership in O(1) without copying bytes."],
  "meditation": {
    "book": "Book IV",
    "verse": "Section 24",
    "stoicConcept": "Apallage (Pruning the unnecessary)",
    "quote": "Why copy the vessel when you can hand it across the threshold?",
    "reflection": "Most latency comes from extra work we added ourselves. Pass the buffer directly."
  },
  "userNote": "Cut frame latency from 45ms to 0.2ms."
}' --open
```

## Automatic background hook

`agent-diary` registers a `Stop` hook in `~/.gemini/config/hooks.json` (Antigravity), `~/.claude/settings.json` (Claude Code settings), and `turn.complete` in `hooks/register.js` (Claude Code Mod). When a turn ends, `scripts/auto-hook.mjs` pulls new sessions into `data/diary-entries.json` and rebuilds `diary.html` without overwriting your manual notes.

## License

MIT (c) [Hemanth.HM](https://h3manth.com)
