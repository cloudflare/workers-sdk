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

	it("previews resolved trigger targets during a dry run", async ({
		expect,
	}) => {
		writeWranglerConfig({
			name: "configured-worker",
			workers_dev: false,
			routes: [{ pattern: "custom.example.com", custom_domain: true }],
			triggers: { crons: ["0 * * * *"] },
			queues: { consumers: [{ queue: "my-queue" }] },
			workflows: [
				{ binding: "WORKFLOW", name: "my-workflow", class_name: "Workflow" },
			],
		});

		await runWrangler("triggers deploy --dry-run --name overridden-worker");

		expect(std.out).toMatchInlineSnapshot(`
			"--dry-run: no changes will be made. Would deploy overridden-worker triggers:
			  custom.example.com (custom domain)
			  schedule: 0 * * * *
			  Consumer for my-queue
			  workflow: my-workflow"
		`);
	});

	it("previews command-line route and schedule overrides", async ({
		expect,
	}) => {
		writeWranglerConfig({
			name: "configured-worker",
			workers_dev: false,
			routes: ["configured.example.com/*"],
			triggers: { crons: ["0 * * * *"] },
		});

		await runWrangler(
			'triggers deploy --dry-run --route overridden.example.com/* --schedule "30 * * * *"'
		);

		expect(std.out).toMatchInlineSnapshot(`
			"--dry-run: no changes will be made. Would deploy configured-worker triggers:
			  overridden.example.com/*
			  schedule: 30 * * * *"
		`);
	});

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
		expect(std.out).toContain("--dry-run: no changes will be made.");
	});

	describe("--zone and --zone-id flags", () => {
		it("accepts a --zone for the --route patterns", async ({ expect }) => {
			writeWranglerConfig();

			await runWrangler(
				"triggers deploy --dry-run --x-route-zones --route a.example.com/* --route b.example.com/* --zone example.com"
			);

			expect(std.out).toContain("--dry-run: no changes will be made.");
			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("errors when --zone is used without --experimental-route-zones", async ({
			expect,
		}) => {
			writeWranglerConfig();

			await expect(
				runWrangler(
					"triggers deploy --dry-run --route a.example.com/* --zone example.com"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: --zone and --zone-id are experimental and require the --experimental-route-zones (--x-route-zones) flag.]`
			);
		});

		it("errors when --zone and --zone-id are used together", async ({
			expect,
		}) => {
			writeWranglerConfig();

			await expect(
				runWrangler(
					"triggers deploy --dry-run --x-route-zones --route a.example.com/* --zone example.com --zone-id example-com-id"
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
				runWrangler(
					"triggers deploy --dry-run --x-route-zones --zone-id example-com-id"
				)
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: --zone-id can only be used together with --route. To attach a zone to routes defined in your config file, set "zone_name" or "zone_id" on each route there instead.]`
			);
		});
	});
});
