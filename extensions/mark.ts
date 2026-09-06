/**
 * mark.ts — 对话章节标记
 *
 * /mark <文本> 在 session tree 中插入一条真正的 user 消息节点
 * （type: "message", role: "user"），不触发回复：
 *   - 通过私有接口 sessionManager.appendMessage() 直接写树
 *     （类型层是 ReadonlySessionManager，运行时是完整 SessionManager）
 *   - 因此 tree 里 Ctrl+U（user-only 筛选）能看到它
 *   - 同时打 "📌 mark" label，Ctrl+L（labeled-only）也能筛出
 *   - 持久化到 session 文件，/reload、重启、resume 后仍在
 *
 * 与旧版 custom_message 实现的差异（刻意取舍）：
 *   - 不经过 pi.sendMessage()，因此不 emit message_start/message_end，
 *     实时聊天面板不会立即显示（reload 后会在 transcript 中以 user 消息出现）
 *   - 不写 agent.state.messages，因此下一条消息不会立刻把它带给模型；
 *     只有 compaction / navigateTree 重建上下文后才会作为 user 消息进入 LLM 上下文
 *   - agent streaming 期间拒绝标记（直接写树会打断当前 turn 的树结构）
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MARK_LABEL = "📌 mark";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("mark", {
		description: "插入章节标记（真 user 节点）：tree 中 Ctrl+U / Ctrl+L 可见，不触发回复",
		handler: async (args, ctx) => {
			let text = args.trim();
			if (!text) {
				if (!ctx.hasUI) {
					ctx.ui.notify("用法: /mark <标记文本>", "warning");
					return;
				}
				const input = await ctx.ui.input("插入标记", "例如：—— 以下是部署问题排查 ——");
				text = input?.trim() ?? "";
				if (!text) {
					ctx.ui.notify("已取消", "info");
					return;
				}
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify("正在生成回复，结束后再标记", "warning");
				return;
			}
			// 私有接口：直接向 session tree 追加一条 user 消息节点。
			// 这样 Ctrl+U 的 user-only 筛选能看到它。
			const entryId = (ctx.sessionManager as any).appendMessage({
				role: "user",
				content: [{ type: "text", text }],
				timestamp: Date.now(),
			});
			pi.setLabel(entryId, MARK_LABEL);
		},
	});
}
