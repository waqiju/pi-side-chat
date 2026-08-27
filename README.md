# pi-side-chat

Two small workflow extensions for pi's native session tree:

- **side-chat** — chat on a **side branch of the tree**, then jump back to the main thread. Unlike [pi-btw](https://github.com/narumiruna/pi-extensions)-style side questions, nothing is kept in a separate chat list — every word stays in the same session file, visible and navigable via `/tree`.
- **mark** — insert a **marker message** into the tree (`/mark <text>`): it shows up immediately like a user message, doesn't trigger a reply, and rides along to the LLM (as `role: "user"`) with your next prompt. 章节标记：立即显示、不单独发送、随下一条消息一起进上下文。

在 pi 原生 session tree 上开 side 分支聊天，随时一键跳回主线；并可插入地位等同 user message 的标记消息。不维护独立 chat 列表——所有对话都在同一个 session tree 里。

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

`/mark <text>` (or bare `/mark` for an input prompt) inserts a `custom_message` entry that pi treats like a user message everywhere it matters:

- **Shows immediately** in the TUI (rendered as a 📌 divider) and persists as its own tree node — selectable in `/tree` with the same behavior as a user message.
- **Does not send anything**: no turn is triggered.
- **Sent with the next prompt**: it is already in the agent's context, and pi's `convertToLlm` maps it to `role: "user"` — same status as a real user message, also for compaction/branch summaries.
- While the agent is streaming, `/mark` is queued via steer and delivered within the current turn.

Implementation: `pi.sendMessage({ customType: "mark", content, display: true })` with no options — pi's idle path appends it to context + session + TUI without triggering a turn. No filtering, no payload hacks.

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
