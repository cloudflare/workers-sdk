import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import { test } from "vitest";
import { startPublishedWrangler } from "./helpers/published-wrangler";

test.for([
	{ turboHash: "test-hash", turboIsTui: "", interactive: false },
	{ turboHash: "test-hash", turboIsTui: "false", interactive: false },
	{ turboHash: "test-hash", turboIsTui: "true", interactive: true },
	{ turboHash: "", turboIsTui: "", interactive: true },
])(
	"shows Wrangler hotkeys only when input is forwarded ($turboHash/$turboIsTui)",
	async (
		{ turboHash, turboIsTui, interactive },
		{ expect, onTestFinished }
	) => {
		const root = await mkdtemp(join(tmpdir(), "vite-v1-turborepo-"));
		onTestFinished(() => removeDir(root));
		await writeFile(
			join(root, "wrangler.json"),
			JSON.stringify({
				name: "turborepo-test",
				main: "index.js",
				compatibility_date: "2026-10-15",
			})
		);
		await writeFile(
			join(root, "index.js"),
			"export default { fetch() { return new Response('ok'); } };"
		);
		const wrangler = startPublishedWrangler(
			["dev", "--ip", "127.0.0.1", "--port", "0", "--inspector-port", "0"],
			root,
			{ TURBO_HASH: turboHash, TURBO_IS_TUI: turboIsTui }
		);
		await wrangler.waitForOutput("Ready on");

		for (const hotkey of [
			"open a browser",
			"open devtools",
			"clear console",
			"to exit",
		]) {
			if (interactive) {
				expect(wrangler.output).toContain(hotkey);
			} else {
				expect(wrangler.output).not.toContain(hotkey);
			}
		}
	}
);
