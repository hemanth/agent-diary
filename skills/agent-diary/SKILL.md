---
name: agent-diary
description: >-
  Extracts technical challenges, root-cause fixes, and learnings from AI agent
  sessions (Antigravity, Claude Code, and Git history), prompts the user to
  write personal notes, and builds an HTML diary and Claude Code Mod pane with
  Marcus Aurelius style reflections. Use when the user asks to write a diary,
  log session learnings, review bugs and fixes across sessions, or open their
  agent diary.
---

# Agent diary (`agent-diary`)

Turn AI pair-programming sessions into an HTML engineering diary and an interactive Claude Code Mod pane that pair bugs, fixes, and technical takeaways with personal notes in the style of Marcus Aurelius's *Meditations* (*Ta Eis Heauton*).

## Quick open

When the user runs `/agent-diary` or asks to open or view their diary, run:

```bash
agent-diary
```

In a Claude Code session with the mod loaded (`~/.claude/skills/agent-diary` or `claude --plugin-dir .`):
- `/diary` opens the in-terminal `Agent Diary (Ta Eis Heauton)` pane (`1: Entries`, `2: Meditations`, `3: Write Note`).
- `/diary-note <reflection>` saves a personal reflection note directly from the prompt.
- `/diary-open` opens `diary.html` in the browser.

Files in the repository:
- HTML file: `diary.html`
- Markdown export: `DIARY.md`
- JSON data: `data/diary-entries.json`
- Claude Code Mod: `hooks/register.js`

## How it works

1. **Harvest sessions**: Scan `.jsonl` transcripts in `~/.gemini/antigravity-cli/brain/` and `~/.claude/projects/` for errors, user corrections, and final fixes.
2. **Write the four sections**: Record the challenge, the fix, the reusable lesson, and a short reflection modeled on *Meditations*.
3. **Get the user's note**: Ask the user one short question about what stood out in the session, or let them type it in the `/diary` pane (`Tab 3: Write Note`) or the HTML editor.
4. **Compile the HTML**: Run `scripts/build-diary.mjs` to update `diary.html`, `docs/index.html`, and `DIARY.md`.

### Automatic hooks (`Stop` and `turn.complete`)

The diary updates in the background when a turn ends in Antigravity (`~/.gemini/config/hooks.json`), Claude Code settings (`~/.claude/settings.json`), or the Claude Code Mod (`turn.complete` in `hooks/register.js`). Curated entries and `userNote` fields are never overwritten.

## Harvesting transcripts manually

```bash
# List the 15 most recent sessions across Antigravity and Claude Code
agent-diary harvest --limit 15

# Dump harvested session data as JSON
agent-diary harvest --limit 20 --json > /tmp/harvested-sessions.json
```

When reading transcripts, look for moments where the first attempt failed:
- User pushback like `"lol, how true is that data?"`, `"it says Render Complete, but it doesn't have the captions"`, or `"server down?"`.
- Non-zero exit codes, stack traces, OAuth 403 blocks, WASM memory errors, or layout bugs.
- The specific change that fixed the problem, such as reading Snappy-compressed LevelDB `.ldb` files instead of SQLite `visits`, or scaling subtitles by `min(outW, outH)` instead of height alone.

## Writing the Marcus Aurelius note

Keep the Stoic note grounded in the actual bug from the session:
- Address yourself directly: *"Remind yourself..."*, *"Do not trust the green badge before inspecting the frame..."*, *"Look at the tensor shapes themselves..."*
- Tie Stoic ideas to concrete engineering problems:
  - *Phantasia* (testing appearances): Mock fallback data or a premature `"Render Complete"` message pretending the job is done.
  - *Hupokeimena* (working with obstacles): A `484x1080` portrait video or an OAuth test-user block forcing a cleaner design.
  - *Apallage* (cutting what is unnecessary): Pruning 50 tool schemas down to 3 in 0.4ms instead of burning an extra LLM round-trip.
- Avoid generic fortune-cookie quotes. Mention the actual constraint from the session.

## Prompting the user

Ask one plain question before wrapping up:
> "Before I save today's entry: which bug or fix from today do you want to add a personal note on?"

Save their reply into `userNote`, or let them add it via `/diary-note` or inside `diary.html` using the **Write Today's Entry** form (supports browser voice dictation and Markdown/JSON export).

## Entry schema (`data/diary-entries.json`)

```json
{
  "id": "entry-2026-10-04-audio-worklet",
  "sessionId": "demo-a101-4f82-9c11-000000000001",
  "date": "2026-10-04",
  "time": "22:47 PDT",
  "project": "audio-worklet",
  "workspace": "~/projects/audio-worklet",
  "agent": "Antigravity (Gemini 4 Argon)",
  "title": "Portrait video geometry and burned-in FFmpeg WASM subtitles",
  "summary": "Switched STT to Cactus-Compute Whistle, wired burned-in subtitles into the FFmpeg WASM export, and fixed horizontal text clipping on 484x1080 portrait videos.",
  "tags": ["ffmpeg-wasm", "whistle-stt", "video-geometry", "canvas"],
  "virtue": "Temperance and Proportion (Sophrosyne)",
  "challenges": [
    "The UI showed 'Render Complete', but the exported MP4 had no captions because the canvas overlay was never passed into the FFmpeg WASM filtergraph.",
    "Portrait screen recordings (484x1080) rendered 54px captions that clipped off both sides because font size scaled only by video height (outH / 480)."
  ],
  "solutions": [
    "Mounted the generated subtitle file in the FFmpeg WASM pass and extracted a single PNG frame after export to verify the pixels.",
    "Changed font scaling to use Math.min(outW, outH) / 480 with line wrapping for narrow portrait frames."
  ],
  "learnings": [
    "Scale video overlay text against min(width, height) rather than height alone so 9:16 portrait videos do not overflow horizontally.",
    "Check an extracted video frame on disk before trusting a 'Render Complete' state."
  ],
  "meditation": {
    "book": "Book IV",
    "verse": "Section 19",
    "location": "Written while checking a 484x1080 frame in audio-worklet",
    "stoicConcept": "Metron (Measure and proportion)",
    "quote": "The herald cries that the work is finished, yet the stone has no inscription. And when you carve the letters, if you measure only the height of the column and ignore its narrow width, the words spill over the edge.",
    "reflection": "Two mistakes come up often: assuming a job succeeded because a function returned without throwing, and applying a landscape rule to a narrow portrait frame. Measure both dimensions before drawing."
  },
  "userNote": "Testing on a real 484x1080 mobile recording caught the height-only font scaling bug right away."
}
```
