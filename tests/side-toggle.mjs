import assert from 'node:assert/strict';
import extension from '../extensions/side-chat.ts';

function world() {
  const entries = new Map([['A', { id: 'A', type: 'message', parentId: null }]]);
  const labels = new Map();
  let leaf = 'A', seq = 0, status, navigations = 0;
  let shortcuts, commands, events;
  const ctx = {
    sessionManager: {
      getLeafId: () => leaf,
      getEntry: id => entries.get(id),
      getEntries: () => [...entries.values()],
      getLabel: id => labels.get(id),
    },
    ui: { notify() {}, setStatus: (_, text) => { status = text; } },
    isIdle: () => true,
    navigateTree: async id => { navigations++; leaf = id; return { cancelled: false }; },
  };
  const pi = {
    registerShortcut: (key, value) => shortcuts.set(key, value),
    registerCommand: (key, value) => commands.set(key, value),
    on: (key, value) => events.set(key, value),
    setLabel: (id, label) => {
      if (label === undefined) labels.delete(id); else labels.set(id, label);
      append('label');
    },
  };
  function append(type) {
    const id = `e${++seq}`;
    entries.set(id, { id, type, parentId: leaf });
    leaf = id;
    return id;
  }
  function reload() {
    shortcuts = new Map(); commands = new Map(); events = new Map();
    extension(pi);
    return events.get('session_start')({}, ctx);
  }
  reload();
  return {
    side: () => shortcuts.get('alt+s').handler(ctx),
    sideCommand: () => commands.get('side').handler('', ctx),
    main: () => commands.get('main').handler('', ctx),
    append, reload, labels, entries,
    status: () => status, navigations: () => navigations,
  };
}

const w = world();
w.side();
assert.equal(w.labels.get('A'), '⚓ main 1');
await w.sideCommand();
assert.equal(w.labels.size, 0);
assert.equal(w.status(), undefined);
assert.equal(w.navigations(), 0);
w.side();
assert.equal(w.labels.get('A'), '⚓ main 1');
const b = w.append('message');
w.side();
assert.equal(w.labels.get(b), '⚓ main 2');
await w.reload();
w.side();
assert.equal(w.labels.get(b), undefined);
assert.equal(w.labels.get('A'), '⚓ main 1');
assert.match(w.status(), /×1/);
w.side();
const c = w.append('message');
await w.main();
assert.equal(w.navigations(), 1);
assert.equal(w.labels.get(c), '🌿 side');
w.side();
assert.equal(w.labels.get(b), '⚓ main 2');
w.side();
const marker = w.append('custom_message');
w.side();
assert.equal(w.labels.get(marker), '⚓ main 2');
await w.main();
assert.equal(w.navigations(), 1, 'same-position return must not navigate');
assert.equal(w.labels.get(marker), undefined);

// Compatibility: old versions could anchor directly on a label entry.
const legacy = world();
const labelId = legacy.append('label');
legacy.labels.set(labelId, '⚓ main 1');
await legacy.reload();
legacy.side();
assert.equal(legacy.labels.size, 0);
assert.equal(legacy.navigations(), 0);
console.log('PASS: toggle, repeated labels, nesting, reload, return/re-anchor, /mark, legacy anchors');
