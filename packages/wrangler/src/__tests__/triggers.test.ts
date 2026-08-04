import {
	runInTempDir,
	writeRedirectedWranglerConfig,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runWrangler } from "./helpers/run-wrangler";

describe("triggers deploy", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("uses a redirected deploy configuration", async ({ expect }) => {
		writeWranglerConfig({ name: undefined });
		writeRedirectedWranglerConfig(
			{
				name: "generated-worker",
				userConfigPath: "./wrangler.toml",
			},
			"./dist/wrangler.json"
		);

		await runWrangler("triggers deploy --dry-run");

		expect(std.info).toContain(
			'Using redirected Wrangler configuration.\n - Configuration being used: "dist/wrangler.json"'
		);
		expect(std.out).toContain("--dry-run: exiting now.");
	});
});
