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
 *
 * 额外：本文件还注入一个运行时补丁，让 mark 在 /tree 的 Ctrl+U（user-only
 * 筛选）下也可见。详见下方 patchTreeUserOnlyFilter 的注释。
 */

import { TreeSelectorComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
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

// ============================================================================
// /tree Ctrl+U（user-only）兼容补丁（运行时 monkey-patch，不改 pi 源文件）
// ============================================================================
//
// 背景：/tree 的 user-only 筛选只认 `type === "message" && role === "user"`，
// 而 mark 落盘为 `custom_message`，所以默认被 Ctrl+U 过滤掉。
//
// 做法：在内存里包裹私有类 TreeList 的原型方法 applyFilter —— 当 filterMode
// 为 "user-only" 时，先按 "all" 让原版算好完整可见结构，再收窄到
// "user 消息 + custom_message"，最后重算缩进并修正选中项。
//
// 可行性前提（npm 装的 bundled 发行版成立）：扩展里 import 的
// TreeSelectorComponent 与 app 运行时是同一个 class（单例 bundle），改其原型
// 即改 live app。TreeList 未导出，所以用一次性实例 Object.getPrototypeOf 拿原型。
//
// 时机：构造 probe 会触碰全局 theme（TreeSelectorComponent 内部 new Text(...)），
// 所以推迟到 session_start 再注入（此时 theme 已初始化），而不是扩展加载时。
//
// 风险：依赖内部方法名 applyFilter / recalculateVisualStructure /
// findNearestVisibleIndex，pi 升级若改了这些内部实现补丁会失效（届时按
// session_start 的 warning 提示来修这里）。补丁是 best-effort，失败不影响 mark 本体。

/** 防重复补丁标记：挂在原型上（/reload 会重跑扩展，但原型是 app 级单例）。 */
const TREE_PATCH_FLAG = "__markUserOnlyPatched__";

function patchTreeUserOnlyFilter(): void {
	// 造一个一次性 selector（不渲染、用完即弃），只为拿到 TreeList.prototype。
	// 构造函数只建数据结构 + 静态子组件，不触碰 keybindings/render，安全。
	const probeTree = [
		{
			entry: {
				id: "__mark_probe__",
				parentId: null,
				timestamp: new Date().toISOString(),
				type: "message",
				message: { role: "user", content: "probe", timestamp: Date.now() },
			},
			children: [],
		},
	] as any;
	const probe = new TreeSelectorComponent(probeTree, null, 24, () => {}, () => {}, () => {});
	const proto = Object.getPrototypeOf(probe.getTreeList()) as Record<string, any>;

	if (proto[TREE_PATCH_FLAG]) return;

	// 升级后内部方法可能被改名/删除：提前校验，失败时抛错（走 warning，不静默）。
	for (const m of ["applyFilter", "recalculateVisualStructure", "findNearestVisibleIndex"]) {
		if (typeof proto[m] !== "function") {
			throw new Error(`TreeList.${m} 不存在（pi 内部已变更，需更新 mark.ts 补丁）`);
		}
	}

	const origApplyFilter = proto.applyFilter;
	proto.applyFilter = function (this: any, ...args: any[]) {
		if (this.filterMode !== "user-only") {
			return origApplyFilter.apply(this, args);
		}
		// 借 "all" 让原版算好完整可见集（含折叠/搜索/结构），再收窄。
		this.filterMode = "all";
		origApplyFilter.apply(this, args);
		this.filterMode = "user-only";
		this.filteredNodes = this.filteredNodes.filter((fn: any) => {
			const e = fn.node.entry;
			return (e.type === "message" && e.message.role === "user") || e.type === "custom_message";
		});
		this.recalculateVisualStructure();
		if (this.lastSelectedId) {
			this.selectedIndex = this.findNearestVisibleIndex(this.lastSelectedId);
		} else if (this.selectedIndex >= this.filteredNodes.length) {
			this.selectedIndex = Math.max(0, this.filteredNodes.length - 1);
		}
		if (this.filteredNodes.length > 0) {
			this.lastSelectedId = this.filteredNodes[this.selectedIndex]?.node.entry.id ?? this.lastSelectedId;
		}
	};

	proto[TREE_PATCH_FLAG] = true;
}

export default function (pi: ExtensionAPI) {
	// 注入 Ctrl+U 兼容补丁。推迟到 session_start（theme 已就绪），仅 TUI 模式需要
	// （/tree 是 TUI 功能）。best-effort：失败只告警一次，不影响 mark 本体。
	let patchSettled = false;
	pi.on("session_start", (_event, ctx) => {
		if (patchSettled || ctx.mode !== "tui") return;
		patchSettled = true;
		try {
			patchTreeUserOnlyFilter();
		} catch (err) {
			ctx.ui.notify(
				`mark: Ctrl+U 兼容补丁未生效：${err instanceof Error ? err.message : String(err)}`,
				"warning",
			);
		}
	});

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
