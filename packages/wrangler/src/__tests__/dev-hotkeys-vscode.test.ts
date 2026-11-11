import { afterEach, describe, it, vi } from "vitest";
import registerHotKeys from "../cli-hotkeys";
import registerDevHotKeys from "../dev/hotkeys";
import type { DevEnv } from "../api";

vi.mock("../cli-hotkeys", () => ({ default: vi.fn(() => () => {}) }));

type HotKey = { keys: string[]; disabled?: boolean | (() => boolean) };

function isDevtoolsHotkeyDisabled() {
	vi.mocked(registerHotKeys).mockClear();
	registerDevHotKeys([{} as DevEnv], { remote: false }, { render: false });
	const keys = vi.mocked(registerHotKeys).mock.calls[0][0] as HotKey[];
	const d = keys.find((k) => k.keys.includes("d"))!;
	return typeof d.disabled === "function" ? d.disabled() : !!d.disabled;
}

describe("devtools hotkey inside VS Code terminals", () => {
	const original = process.env.VSCODE_INSPECTOR_OPTIONS;
	afterEach(() => {
		if (original === undefined) {
			delete process.env.VSCODE_INSPECTOR_OPTIONS;
		} else {
			process.env.VSCODE_INSPECTOR_OPTIONS = original;
		}
	});

	it("is enabled in a plain VS Code terminal (auto attach smart, deferred mode)", ({
		expect,
	}) => {
		// Value seen in a regular (non JS Debug) VS Code terminal with auto attach "smart"
		process.env.VSCODE_INSPECTOR_OPTIONS = `:::${JSON.stringify({
			inspectorIpc: "/tmp/node-cdp.9298-e72fdf6a-0.sock.deferred",
			deferredMode: true,
			waitForDebugger: "",
			autoAttachMode: "smart",
		})}`;
		expect(isDevtoolsHotkeyDisabled()).toBe(false);
	});

	it("is disabled in a JS Debug Terminal", ({ expect }) => {
		process.env.VSCODE_INSPECTOR_OPTIONS = JSON.stringify({
			inspectorIpc: "/tmp/node-cdp.32672-ea02cccd-0.sock",
			deferredMode: false,
			waitForDebugger: "",
			autoAttachMode: "always",
		});
		expect(isDevtoolsHotkeyDisabled()).toBe(true);
	});
});
