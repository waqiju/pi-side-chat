/**
 * side-branch.ts
 *
 * 在 pi 原生 session tree 上开 side 分支聊天，随时跳回主线。
 * 不维护独立 chat 列表——所有对话都在同一个 session tree 里。
 *
 * 用法：
 *   alt+s （或 /side）  把当前位置锚定为"主线"，之后继续聊天即为 side 分支
 *   alt+m               预填 /main 命令（按 Enter 执行）返回主线
 *   /main               导航回最近一个锚点
 *   /side-clear         清空所有锚点（不导航）
 *
 * 锚点以 label（"⚓ main"）形式持久化在 session 文件里，
 * 因此 /reload、重启、resume 后仍可从 label 恢复。
 * 返回主线时会给 side 分支末端打上 "🌿 side" label，
 * 之后可通过 /tree → Ctrl+L（只看 labeled）找回 side 分支。
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const ANCHOR_LABEL = "⚓ main";
const SIDE_TIP_LABEL = "🌿 side";
const STATUS_KEY = "side-branch";

export default function (pi: ExtensionAPI) {
	// 内存锚点栈；label 是持久化 fallback（扩展实例在 reload/session 切换后会重建）
	let anchors: string[] = [];

	function rebuildFromLabels(ctx: ExtensionContext): void {
		anchors = [];
		for (const entry of ctx.sessionManager.getEntries()) {
			const label = ctx.sessionManager.getLabel(entry.id);
			if (label?.startsWith(ANCHOR_LABEL)) anchors.push(entry.id);
		}
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (anchors.length === 0) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
		} else {
			ctx.ui.setStatus(STATUS_KEY, `🌿 side ×${anchors.length} · alt+m 回主线`);
		}
	}

	function anchorHere(ctx: ExtensionContext): void {
		const leafId = ctx.sessionManager.getLeafId();
		if (!leafId) {
			ctx.ui.notify("空会话，无法锚定", "warning");
			return;
		}
		if (anchors.length === 0) rebuildFromLabels(ctx);
		if (anchors[anchors.length - 1] === leafId) {
			ctx.ui.notify("当前位置已是锚点 ⚓", "info");
			return;
		}
		anchors.push(leafId);
		pi.setLabel(leafId, `${ANCHOR_LABEL} ${anchors.length}`);
		updateStatus(ctx);
		ctx.ui.notify("已锚定主线 ⚓ 继续聊就是 side 分支；alt+m 返回", "info");
	}

	async function backToMain(ctx: ExtensionCommandContext): Promise<void> {
		if (anchors.length === 0) rebuildFromLabels(ctx);
		const id = anchors.pop();
		if (!id) {
			ctx.ui.notify("没有主线锚点（先 alt+s 锚定）", "warning");
			return;
		}
		if (!ctx.sessionManager.getEntry(id)) {
			pi.setLabel(id, undefined);
			updateStatus(ctx);
			ctx.ui.notify("锚点已失效，已从栈中移除", "warning");
			return;
		}
		if (!ctx.isIdle()) {
			anchors.push(id); // 放回去，等回复结束再来
			ctx.ui.notify("正在生成回复，结束后再返回", "warning");
			return;
		}

		const tip = ctx.sessionManager.getLeafId();
		if (tip === id) {
			// 已经在锚点上，直接消耗掉这个锚点
			pi.setLabel(id, undefined);
			updateStatus(ctx);
			ctx.ui.notify("已在主线锚点位置", "info");
			return;
		}

		const result = await ctx.navigateTree(id, { summarize: false });
		if (result.cancelled) {
			anchors.push(id); // 导航被其他扩展取消，恢复锚点
			ctx.ui.notify("返回被取消（其他扩展拦截）", "warning");
			return;
		}
		if (tip) pi.setLabel(tip, SIDE_TIP_LABEL);
		pi.setLabel(id, undefined);
		updateStatus(ctx);
		ctx.ui.notify("已回到主线 ⚓ side 分支保留在 /tree（🌿 side）", "info");
	}

	function clearAll(ctx: ExtensionContext): void {
		for (const entry of ctx.sessionManager.getEntries()) {
			const label = ctx.sessionManager.getLabel(entry.id);
			if (label?.startsWith(ANCHOR_LABEL)) pi.setLabel(entry.id, undefined);
		}
		anchors = [];
		updateStatus(ctx);
		ctx.ui.notify("已清空所有主线锚点", "info");
	}

	// --- Shortcuts ---

	pi.registerShortcut("alt+s", {
		description: "Anchor main thread here; keep chatting on a side branch",
		handler: (ctx) => anchorHere(ctx),
	});

	pi.registerShortcut("alt+m", {
		description: "Return to main thread (prefills /main; press Enter)",
		handler: (ctx) => {
			if (anchors.length === 0) rebuildFromLabels(ctx);
			if (anchors.length === 0) {
				ctx.ui.notify("没有主线锚点（先 alt+s 锚定）", "warning");
				return;
			}
			// shortcut ctx 没有 navigateTree，只能预填命令交给 /main 执行
			if (ctx.ui.getEditorText().trim()) {
				ctx.ui.notify("编辑器有草稿，请手动输入 /main 返回", "warning");
				return;
			}
			ctx.ui.setEditorText("/main");
			ctx.ui.notify("按 Enter 返回主线 ⚓", "info");
		},
	});

	// --- Commands ---

	pi.registerCommand("side", {
		description: "Anchor main thread here; keep chatting on a side branch",
		handler: async (_args, ctx) => anchorHere(ctx),
	});

	pi.registerCommand("main", {
		description: "Navigate back to the most recent main-thread anchor",
		handler: async (_args, ctx) => backToMain(ctx),
	});

	pi.registerCommand("side-clear", {
		description: "Clear all main-thread anchors without navigating",
		handler: async (_args, ctx) => clearAll(ctx),
	});

	// --- Lifecycle: reload / session 切换后从 label 恢复锚点栈 ---

	pi.on("session_start", async (_event, ctx) => {
		rebuildFromLabels(ctx);
		updateStatus(ctx);
	});
}
