const PANE_ID = 'agent-diary';
const DIARY_JSON_PATH = 'data/diary-entries.json';

const FALLBACK_ENTRIES = [
  {
    id: 'entry-2026-10-05-audio-worklet',
    date: '2026-10-05',
    project: 'audio-worklet',
    title: 'Zero-copy ring buffers in the WebAudio render quantum',
    virtue: 'Temperance and Proportion (Sophrosyne)',
    challenges: [
      'The UI showed Render Complete, but the exported MP4 had no captions because the canvas overlay was not passed into the FFmpeg WASM filtergraph.',
      'Portrait screen recordings (484x1080) rendered 54px captions that clipped horizontally.'
    ],
    solutions: [
      'Mounted the subtitle file in the FFmpeg WASM pass and extracted a PNG frame after export to verify the pixels.',
      'Scaled subtitle font size by Math.min(outW, outH) / 480 with line wrapping.'
    ],
    learnings: [
      'Scale video overlay text against min(width, height) rather than height alone.',
      'Inspect an extracted frame on disk before trusting a Render Complete badge.'
    ],
    meditation: {
      book: 'Book IV',
      verse: 'Section 19',
      stoicConcept: 'Metron (Measure and proportion)',
      quote: 'The herald cries that the work is finished, yet the stone has no inscription. Measure both dimensions of the column before you carve.',
      reflection: 'Do not assume a job succeeded because a function returned without throwing. Verify the artifact on disk.'
    },
    userNote: 'Testing on a real 484x1080 mobile recording caught the height-only font scaling bug right away.'
  },
  {
    id: 'entry-2026-10-03-sqlite-wal',
    date: '2026-10-03',
    project: 'sqlite-wal',
    title: 'Preventing WAL starvation under continuous reader load',
    virtue: 'Truthfulness (Aletheia)',
    challenges: [
      'Chrome SQLite visits table was empty when History Sync was off, causing the dashboard to show fake fallback numbers.'
    ],
    solutions: [
      'Built a pure-Node Snappy decompressor to read Chromium Local Extension Settings LevelDB (.ldb) files directly.'
    ],
    learnings: [
      'Never ship silent mock fallback data when a parser fails; surface the empty state so the root cause gets fixed.'
    ],
    meditation: {
      book: 'Book III',
      verse: 'Section 11',
      stoicConcept: 'Hypolepsis (Testing impressions)',
      quote: 'Strip away the painted mask and examine the thing itself: is this gold from the mine, or brass coined in your own workshop to quiet a question?',
      reflection: 'A blank screen is honest and makes you find the real data source. A fake chart hides the bug.'
    },
    userNote: 'Reading the Snappy-compressed .ldb files directly gave us the exact per-domain seconds.'
  }
];

let entries = FALLBACK_ENTRIES.slice();
let notes = [];
let activeTab = 'entries';
let selectedIndex = 0;
let meditationIndex = 0;
let showBanner = false;
let turnTools = 0;
let turnObstacles = 0;
let lastObstacleTool = '';
let diaryJsonPath = DIARY_JSON_PATH;

function applyParsedEntries(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      entries = parsed;
      if (selectedIndex >= entries.length) {
        selectedIndex = 0;
      }
    }
  } catch {
    // Keep existing entries if JSON parsing fails.
  }
}

function buildNoteRecord(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return null;
  }
  const target = entries[selectedIndex] || entries[0];
  const record = {
    date: new Date().toISOString().slice(0, 10),
    project: target ? target.project : 'session',
    entryId: target ? target.id : 'custom',
    text: trimmed
  };
  notes = [record, ...notes.slice(0, 19)];
  if (target) {
    target.userNote = trimmed;
  }
  return record;
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      const home = await $.env.get('HOME');
      if (home) {
        diaryJsonPath = home + '/.agent-diary/diary-entries.json';
      }
    } catch {
      // Keep default relative path in sandboxed environments.
    }

    const savedNotes = await $.store.get('notes');
    if (Array.isArray(savedNotes)) {
      notes = savedNotes;
    }
    const savedBanner = await $.store.get('showBanner');
    if (typeof savedBanner === 'boolean') {
      showBanner = savedBanner;
    }

    try {
      const raw = await $.fs.read(diaryJsonPath);
      applyParsedEntries(raw);
    } catch {
      // Keep fallback entries in sandboxed environments.
    }

    try {
      await $.command.register({
        name: 'diary',
        description: 'Open the Stoic Agent Diary pane in Claude Code',
        immediate: true
      });
      await $.command.register({
        name: 'diary-open',
        description: 'Open the full HTML Agent Diary in your browser',
        immediate: true
      });
      await $.command.register({
        name: 'diary-note',
        description: 'Save a personal reflection note to your Agent Diary',
        argumentHint: '<reflection>',
        immediate: true
      });
    } catch {
      // Ignore duplicate command registration errors on reload.
    }

    return next(e);
  });

  on('command.run', { command: 'diary' }, async ($) => {
    try {
      const raw = await $.fs.read(diaryJsonPath);
      applyParsedEntries(raw);
    } catch {
      // Keep existing entries.
    }
    await $.ui.open({
      id: PANE_ID,
      title: 'Agent Diary (Ta Eis Heauton)',
      focus: true,
      closeOnEscape: true
    });
    return {};
  });

  on('command.run', { command: 'diary-open' }, async ($) => {
    try {
      await $.process.run(['agent-diary', 'open']);
      $.ui.toast('Opened diary.html in your browser');
    } catch {
      $.ui.toast('Run: agent-diary open');
    }
    return {};
  });

  on('command.run', { command: 'diary-note' }, async ($, e) => {
    const record = buildNoteRecord(e.args);
    if (!record) {
      activeTab = 'write';
      await $.ui.open({
        id: PANE_ID,
        title: 'Agent Diary (Ta Eis Heauton)',
        focus: true,
        closeOnEscape: true
      });
      return {};
    }
    await $.store.set('notes', notes);
    try {
      await $.fs.write(diaryJsonPath, JSON.stringify(entries, null, 2));
    } catch {
      // Ignore write failures in sandboxed environments.
    }
    $.ui.invalidate('ui.render');
    return {
      text: 'Saved personal reflection to Agent Diary (' + record.project + '): "' + record.text + '"'
    };
  });

  on('tool.call', async ($, e, next) => {
    const result = await next(e);
    turnTools += 1;
    if (result && result.isError) {
      turnObstacles += 1;
      lastObstacleTool = e.tool || 'tool';
    }
    $.ui.invalidate('ui.render');
    return result;
  });

  on('turn.complete', async ($, e, next) => {
    try {
      await $.process.run(['agent-diary', 'sync']);
      const raw = await $.fs.read(diaryJsonPath);
      applyParsedEntries(raw);
    } catch {
      // Ignore background hook errors in sandboxed environments.
    }
    $.ui.invalidate('ui.render');
    return next(e);
  });

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const suffix =
      turnObstacles > 0
        ? ' | diary: ' + turnObstacles + ' obstacle(s) via ' + lastObstacleTool
        : ' | diary: ' + entries.length + ' entries';
    return next({
      ...e,
      props: {
        ...e.props,
        suffix
      }
    });
  });

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!showBanner) {
      return next(e);
    }
    const { Box, Text } = $.ui.resolve(e);
    const current = entries[meditationIndex] || entries[0];
    const med = current && current.meditation ? current.meditation : FALLBACK_ENTRIES[0].meditation;
    return Box({
      borderStyle: 'round',
      borderColor: 'yellow',
      paddingX: 1,
      flexDirection: 'row',
      columnGap: 1,
      children: [
        Text({ bold: true, color: 'yellow', children: ['[' + med.book + ' ' + med.verse + ']'] }),
        Text({ dimColor: true, children: [med.quote] })
      ]
    });
  });

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) {
      return next(e);
    }
    const { Box, Text, Button, Input, Markdown } = $.ui.resolve(e);
    const entry = entries[selectedIndex] || entries[0];
    const medEntry = entries[meditationIndex] || entry;
    const med = medEntry && medEntry.meditation ? medEntry.meditation : FALLBACK_ENTRIES[0].meditation;

    const navBar = Box({
      flexDirection: 'row',
      columnGap: 3,
      children: [
        Button({
          key: 'tab-entries',
          label: 'Entries (' + entries.length + ')',
          hotkey: '1',
          plain: true,
          dimColor: activeTab !== 'entries',
          onPress: () => {
            activeTab = 'entries';
            $.ui.invalidate('ui.render');
          }
        }),
        Button({
          key: 'tab-meditations',
          label: 'Meditations',
          hotkey: '2',
          plain: true,
          dimColor: activeTab !== 'meditations',
          onPress: () => {
            activeTab = 'meditations';
            $.ui.invalidate('ui.render');
          }
        }),
        Button({
          key: 'tab-write',
          label: 'Write Note (' + notes.length + ')',
          hotkey: '3',
          plain: true,
          dimColor: activeTab !== 'write',
          onPress: () => {
            activeTab = 'write';
            $.ui.invalidate('ui.render');
          }
        }),
        Button({
          key: 'toggle-banner',
          label: 'Stoic Banner: ' + (showBanner ? 'ON' : 'OFF'),
          hotkey: 'b',
          plain: true,
          dimColor: !showBanner,
          onPress: async () => {
            showBanner = !showBanner;
            await $.store.set('showBanner', showBanner);
            $.ui.invalidate('ui.render');
          }
        }),
        Button({
          key: 'open-html',
          label: 'Open HTML',
          hotkey: 'o',
          plain: true,
          onPress: async () => {
            try {
              await $.process.run(['agent-diary', 'open']);
              $.ui.toast('Opened diary.html in your browser');
            } catch {
              $.ui.toast('Run: agent-diary open');
            }
          }
        })
      ]
    });

    let bodyChildren = [];

    if (activeTab === 'entries' && entry) {
      const entryMarkdown = [
        '## ' + (selectedIndex + 1) + '/' + entries.length + ' · `' + entry.project + '` (' + entry.date + ')',
        '',
        '**' + entry.title + '** (' + (entry.virtue || 'Practical Wisdom') + ')',
        '',
        '### Obstacles',
        '',
        ...(entry.challenges || []).slice(0, 3).map((c) => '- ' + c),
        '',
        '### Fixes',
        '',
        ...(entry.solutions || []).slice(0, 3).map((s) => '- ' + s),
        '',
        '### Takeaways',
        '',
        ...(entry.learnings || []).slice(0, 3).map((l) => '- ' + l),
        '',
        entry.userNote
          ? '> Personal note: ' + entry.userNote
          : '> No personal note yet. Press `3` to add one.'
      ].join('\n');

      bodyChildren = [
        Markdown({ text: entryMarkdown }),
        Box({
          flexDirection: 'row',
          columnGap: 2,
          children: [
            Button({
              key: 'prev-entry',
              label: 'Previous Entry',
              hotkey: 'p',
              onPress: () => {
                selectedIndex = (selectedIndex - 1 + entries.length) % entries.length;
                meditationIndex = selectedIndex;
                $.ui.invalidate('ui.render');
              }
            }),
            Button({
              key: 'next-entry',
              label: 'Next Entry',
              hotkey: 'n',
              onPress: () => {
                selectedIndex = (selectedIndex + 1) % entries.length;
                meditationIndex = selectedIndex;
                $.ui.invalidate('ui.render');
              }
            })
          ]
        })
      ];
    } else if (activeTab === 'meditations') {
      const medMarkdown = [
        '## ' + med.book + ', ' + med.verse + ' (' + (med.stoicConcept || 'Ta Eis Heauton') + ')',
        '',
        '> ' + med.quote,
        '',
        med.reflection || '',
        '',
        'Source session: `' + (medEntry ? medEntry.project : 'session') + '` (' + (medEntry ? medEntry.date : '') + ')'
      ].join('\n');

      bodyChildren = [
        Markdown({ text: medMarkdown }),
        Box({
          flexDirection: 'row',
          columnGap: 2,
          children: [
            Button({
              key: 'draw-lot',
              label: 'Draw Another Stoic Lot',
              hotkey: 'm',
              onPress: () => {
                meditationIndex = (meditationIndex + 1) % entries.length;
                $.ui.invalidate('ui.render');
              }
            })
          ]
        })
      ];
    } else {
      const notesMarkdown =
        notes.length > 0
          ? [
              '### Recent notes saved from Claude Code',
              '',
              ...notes.slice(0, 5).map((n) => '- **' + n.date + '** (`' + n.project + '`): ' + n.text)
            ].join('\n')
          : '> No notes saved in this workspace store yet.';

      bodyChildren = [
        Markdown({
          text:
            '## Attach a personal note\n\nTarget entry: `' +
            (entry ? entry.project : 'session') +
            '` - **' +
            (entry ? entry.title : 'current session') +
            '**'
        }),
        Input({
          key: 'diary-note-input',
          label: 'Reflection',
          placeholder: 'What bug, fix, or lesson stood out today? Press Enter to save',
          value: '',
          submitLabel: 'save',
          onSubmit: async (val) => {
            const record = buildNoteRecord(val);
            if (record) {
              await $.store.set('notes', notes);
              try {
                await $.fs.write(diaryJsonPath, JSON.stringify(entries, null, 2));
              } catch {
                // Ignore write failures in sandboxed environments.
              }
              $.ui.toast('Saved note to Agent Diary');
              $.ui.invalidate('ui.render');
            }
          }
        }),
        Markdown({ text: notesMarkdown })
      ];
    }

    const footer = Text({
      dimColor: true,
      children: [
        'Session telemetry: ' + turnTools + ' tool call(s), ' + turnObstacles + ' obstacle(s) | Keys: 1/2/3 tabs, n/p cycle, m lot, b banner, o browser, Esc close'
      ]
    });

    return Box({
      flexDirection: 'column',
      children: [
        navBar,
        Text({ children: [' '] }),
        ...bodyChildren,
        Text({ children: [' '] }),
        footer
      ]
    });
  });
}
