import { expect, test } from 'claude-code/testing';

const PANE = {
  plugin: 'agent-diary',
  component: 'Pane',
  requestId: 'agent-diary',
  viewport: { columns: 120, rows: 36 },
  props: {
    title: 'Agent Diary (Ta Eis Heauton)',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 24 },
    view: {}
  }
} as const;

test('/diary opens the Agent Diary pane and registers commands on session.start', async ($, on) => {
  const registered: string[] = [];
  let openedPaneId = '';

  on('session.start', () => ({ cwd: '/work/agent-diary' }));
  on('env.get', () => ({ value: '/work' }));
  on('store.get', () => ({ value: undefined }));
  on('fs.read', () => ({ deny: 'no file in test' }));
  on('command.register', ($, e) => {
    registered.push(e.name);
    return { value: undefined };
  });
  on('ui.open', ($, e) => {
    openedPaneId = e.id;
    return { value: { isPlaced: true } };
  });

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/agent-diary' });
  expect(registered).toEqual(['diary', 'diary-open', 'diary-note']);

  await $.command.run({ command: 'diary', args: '' });
  expect(openedPaneId).toBe('agent-diary');
});

test('Agent Diary pane renders tabs, cycles meditations, and saves personal notes', async ($, on) => {
  const saved = new Map<string, unknown>();

  on('store.get', ($, e) => ({ value: saved.get(e.key) }));
  on('store.set', ($, e) => {
    saved.set(e.key, e.value);
    return { value: undefined };
  });
  on('fs.write', () => ({ value: undefined }));
  on('ui.toast', () => ({ value: undefined }));

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface });

    // Switch to Tab 1 (Entries) and check the active entry
    await ui.press({ key: 'tab-entries' });
    expect(await ui.find({ type: 'Markdown', text: /audio-worklet/ })).toBeDefined();

    // Switch to Tab 2 (Meditations) and draw another Stoic lot
    await ui.press({ key: 'tab-meditations' });
    expect(await ui.find({ type: 'Markdown', text: /Book (IV|III)/ })).toBeDefined();
    await ui.press({ key: 'draw-lot' });
    expect(await ui.find({ type: 'Markdown', text: /Book (IV|III)/ })).toBeDefined();

    // Switch to Tab 3 (Write Note) and submit a personal reflection
    await ui.press({ key: 'tab-write' });
    await ui.input({ key: 'diary-note-input', text: 'Verified portrait scaling in test' });
    expect(await ui.find({ type: 'Markdown', text: /Verified portrait scaling in test/ })).toBeDefined();

    await ui.unmount();
  }

  const notes = saved.get('notes') as Array<{ text: string }>;
  expect(notes).toBeDefined();
  expect(notes[0].text).toBe('Verified portrait scaling in test');
});

test('tool.call tracks obstacles and /diary-note saves reflections directly', async ($, on) => {
  const saved = new Map<string, unknown>();
  on('store.set', ($, e) => {
    saved.set(e.key, e.value);
    return { value: undefined };
  });
  on('fs.write', () => ({ value: undefined }));
  on('tool.call', () => ({ result: 'Command failed', isError: true }));

  await $.tool.call({ tool: 'Bash', command: 'false' });

  const reply = await $.command.run({
    command: 'diary-note',
    args: 'Checked exit code before trusting build output'
  });
  expect(reply.text).toMatch(/Checked exit code before trusting build output/);
});
