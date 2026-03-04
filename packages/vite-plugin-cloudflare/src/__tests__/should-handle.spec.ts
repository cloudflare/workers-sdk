import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, test } from "vitest";
import { resolvePluginConfig } from "../plugin-config";

describe("resolvePluginConfig - shouldHandle", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vite-plugin-test-"));
	});

	afterEach(() => {
		removeDirSync(tempDir);
	});

	const viteEnv = { mode: "development", command: "serve" as const };

	test("should resolve shouldHandle callback", ({ expect }) => {
		const shouldHandle = (request: Request) => true;
		const pluginConfig = {
			shouldHandle,
		};

		const result = resolvePluginConfig(
			pluginConfig,
			{ root: tempDir },
			viteEnv
		);

		expect(result.shouldHandle).toBe(shouldHandle);
	});
});
