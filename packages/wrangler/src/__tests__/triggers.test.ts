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

	describe("--zone and --zone-id flags", () => {
		it("accepts a --zone for the --route patterns", async ({ expect }) => {
			writeWranglerConfig();

			await runWrangler(
				"triggers deploy --dry-run --route a.example.com/* --route b.example.com/* --zone example.com"
			);

			expect(std.out).toContain("--dry-run: exiting now.");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("errors when --zone and --zone-id are used together", async ({
			expect,
		}) => {
			writeWranglerConfig();

			await expect(
				runWrangler(
					"triggers deploy --dry-run --route a.example.com/* --zone example.com --zone-id example-com-id"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Conflicting options: --zone and --zone-id cannot be used together. Please provide only one.]`
			);
		});

		it("errors when --zone-id is passed without --route", async ({
			expect,
		}) => {
			writeWranglerConfig();

			await expect(
				runWrangler("triggers deploy --dry-run --zone-id example-com-id")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: --zone-id can only be used together with --route. To attach a zone to routes defined in your config file, set "zone_name" or "zone_id" on each route there instead.]`
			);
		});
	});
});
