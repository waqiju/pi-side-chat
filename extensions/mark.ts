/**
 * mark.ts — 对话章节标记
 *
 * /mark <文本> 在 session tree 中插入一条标记消息（custom_message）：
 *   - 立即显示在 TUI、立即持久化到 tree（有自己的节点）
 *   - 不触发回复、不单独发送
 *   - 已进入 agent 上下文：下一条普通 user message 触发 turn 时，
 *     随全量历史一起发给 LLM，且 convertToLlm 将其转为 role: "user"
 *     —— 地位等同 user message
 *   - agent streaming 时调用则走 steer 队列，本轮稍后送达
 *
 * 依据：pi sendCustomMessage 的 idle + 无 triggerTurn 分支会同时
 * push agent.state.messages、appendCustomMessageEntry、emit message_start/end。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";

const MARK_TYPE = "mark";

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter(
				(p): p is { type: "text"; text: string } =>
					typeof p === "object" && p !== null && p.type === "text" && typeof p.text === "string",
			)
			.map((p) => p.text)
			.join("\n");
	}
	return "";
}

export default function (pi: ExtensionAPI) {
	// 渲染为醒目的分隔线样式，区别于普通 user 气泡
	pi.registerMessageRenderer(MARK_TYPE, (message, { outputPad }, theme) => {
		const text = contentText(message.content) || "(空标记)";
		const box = new Box(outputPad, 1, (t) => theme.bg("customMessageBg", t));
		box.addChild(new Text(`${theme.fg("accent", "📌 ")}${theme.bold(text)}`, 0, 0));
		return box;
	});

	pi.registerCommand("mark", {
		description: "插入标记消息：立即显示，随下一条消息一起发给 LLM（不单独触发回复）",
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
			// 关键：不传 options —— idle 时立即落盘+渲染+进上下文且不触发 turn
			pi.sendMessage({ customType: MARK_TYPE, content: text, display: true });
		},
	});
}
