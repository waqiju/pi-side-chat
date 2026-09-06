# pi-side-chat

Two small workflow extensions for pi's native session tree:

- **side-chat** — chat on a **side branch of the tree**, then jump back to the main thread. Unlike [pi-btw](https://github.com/narumiruna/pi-extensions)-style side questions, nothing is kept in a separate chat list — every word stays in the same session file, visible and navigable via `/tree`.
- **mark** — insert a **marker node** into the tree (`/mark <text>`) as a real user message, visible under `Ctrl+U` (user-only) and, via its `📌 mark` label, under `Ctrl+L` (labeled-only); it doesn't trigger a reply. 章节标记：写入真 user 节点，Ctrl+U / Ctrl+L 可见，不触发回复。

在 pi 原生 session tree 上开 side 分支聊天，随时一键跳回主线；并可插入 tree 中 Ctrl+U / Ctrl+L 可见的章节标记节点。不维护独立 chat 列表——所有对话都在同一个 session tree 里。

## Install

```bash
pi install https://github.com/waqiju/pi-side-chat
```

Update later with `pi update --extensions`.

## Usage

| Action | Effect |
|--------|--------|
| `alt+s` (or `/side`) | Anchor the current position as the ⚓ main thread, then keep chatting — the conversation grows as a branch on the tree |
| `alt+m` then `Enter` (or `/main`) | Navigate back to the most recent anchor; the side-branch tip gets a 🌿 label so it stays findable |
| `/side-clear` | Drop all anchors without navigating |

Workflow:

1. Mid-conversation, press `alt+s` — the current leaf is labeled `⚓ main N`.
2. Ask your side questions normally. They are ordinary nodes in the session tree.
3. Press `alt+m`, then `Enter` — pi navigates back to the anchor (`summarize: false`, no branch-summary prompt). The side branch tip is labeled `🌿 side`.
4. To revisit a side branch later: `/tree` → `Ctrl+L` (labeled only) → pick the 🌿 entry.

## Marker messages (`/mark`)

`/mark <text>` (or bare `/mark` for an input prompt) inserts a real **user message** node (`type: "message"`, `role: "user"`) into the session tree:

- **Visible under `Ctrl+U`** in `/tree` — the user-only filter matches real user messages.
- **Also labeled `📌 mark`**, so `Ctrl+L` (labeled-only) filters down to markers.
- **Does not trigger a reply**: the node is written directly to the session tree.
- **Persists** to the session file and survives `/reload`, restart, and resume.
- **Not sent to the LLM with the next prompt**: it is written only to the session tree, not to the in-memory agent context, so it enters LLM context only after a compaction or `navigateTree` rebuild. (Deliberate trade-off to get `Ctrl+U` visibility without modifying pi core.)
- While the agent is streaming, `/mark` refuses to insert (direct tree writes would corrupt the in-flight turn's tree structure).

Implementation: uses the private `sessionManager.appendMessage()` (present at runtime on the object typed as `ReadonlySessionManager`) to write a user-role node, then `pi.setLabel()` to tag it. No turn is triggered.

## Design notes

- **Anchors are persistent**: they are stored as entry labels inside the session file, so they survive `/reload`, restarts, and `pi -c` / `pi -r`. The in-memory anchor stack is rebuilt from labels on `session_start`.
- **Stack semantics**: anchors nest — `alt+s` inside a side branch pushes another anchor; `/main` pops one level at a time.
- **Why `alt+m` needs Enter**: pi's shortcut handlers receive a read-only `ExtensionContext` without `navigateTree`; only command handlers get it. So `alt+m` prefills `/main` into the editor and Enter executes it. (If the editor has a draft, it is left untouched and you're asked to run `/main` manually.)
- While the agent is streaming, `/main` refuses to navigate and keeps the anchor.

If you also use `/tree` manually and don't want the "Summarize branch?" prompt, add this to `~/.pi/agent/settings.json`:

```json
{
  "branchSummary": { "skipPrompt": true }
}
```

## License

MIT
