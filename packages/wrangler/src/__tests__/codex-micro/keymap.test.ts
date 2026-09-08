import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	getCodexMicroKeymapPath,
	loadCodexMicroKeymap,
} from "../../codex-micro/keymap";

describe("Codex Micro keymap", () => {
	runInTempDir();

	it("uses the unsupported config path", ({ expect }) => {
		expect(getCodexMicroKeymapPath("/home/user")).toBe(
			path.join(
				"/home/user",
				".config",
				"wrangler",
				"unsupported.codex_micro_keymap.jsonc"
			)
		);
	});

	it("loads string actions from JSONC", async ({ expect }) => {
		const keymapPath = path.resolve("keymap.jsonc");
		await writeFile(
			keymapPath,
			`{
				// Any Wrangler arguments are accepted.
				"AG00": "dev --port 9000",
				"AG02": "deploy --env staging",
				"AG05": "versions list",
				"ENC_CW": "deployments status --json",
				"ENC_CC": "versions list",
				"ENC": "whoami",
				"AG09": "ignored",
			}`
		);

		await expect(loadCodexMicroKeymap(keymapPath)).resolves.toEqual({
			AG00: "dev --port 9000",
			AG02: "deploy --env staging",
			AG05: "versions list",
			ENC_CW: "deployments status --json",
			ENC_CC: "versions list",
			ENC: "whoami",
		});
	});

	it("uses defaults when the file is missing or malformed", async ({
		expect,
	}) => {
		await expect(
			loadCodexMicroKeymap(path.resolve("missing.jsonc"))
		).resolves.toEqual({});

		const keymapPath = path.resolve("malformed.jsonc");
		await writeFile(keymapPath, "{ nope");
		await expect(loadCodexMicroKeymap(keymapPath)).resolves.toEqual({});
	});
});
