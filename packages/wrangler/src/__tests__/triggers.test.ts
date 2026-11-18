import {
	runInTempDir,
	writeRedirectedWranglerConfig,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, it } from "vitest";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { createFetchResult, msw } from "./helpers/msw";
import { runWrangler } from "./helpers/run-wrangler";
import type { RawConfig } from "@cloudflare/workers-utils";

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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			--dry-run: no changes will be made. Would deploy overridden-worker triggers:
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			--dry-run: no changes will be made. Would deploy configured-worker triggers:
			  overridden.example.com/*
			  schedule: 30 * * * *"
		`);
	});

	it("previews removing all cron schedules", async ({ expect }) => {
		writeWranglerConfig({
			name: "configured-worker",
			workers_dev: false,
			triggers: { crons: [] },
		});

		await runWrangler("triggers deploy --dry-run");

		expect(std.out).toContain("  schedule: remove all");
		expect(std.out).not.toContain("No targets to deploy");
	});

	it.for([
		{ addresses: [], target: "  email routing addresses: remove all" },
		{
			addresses: ["support@example.com"],
			target: "  email routing addresses: 1",
		},
	])(
		"previews Email Routing addresses=$addresses",
		async ({ addresses, target }, { expect }) => {
			writeWranglerConfig({
				name: "configured-worker",
				workers_dev: false,
				addresses,
			});

			await runWrangler("triggers deploy --dry-run");

			expect(std.out).toContain(target);
			expect(std.out).not.toContain("No targets to deploy");
		}
	);

	it("rejects external Workflow settings during a dry run", async ({
		expect,
	}) => {
		writeWranglerConfig({
			name: "configured-worker",
			workflows: [
				{
					binding: "EXTERNAL_WORKFLOW",
					name: "external-workflow",
					class_name: "ExternalWorkflow",
					script_name: "other-worker",
					limits: { steps: 5000 },
				},
			],
		});

		await expect(runWrangler("triggers deploy --dry-run")).rejects.toThrow(
			'Workflow "external-workflow" has "limits" configured but references external script "other-worker"'
		);
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

	describe("--show-diff", () => {
		mockAccountId();
		mockApiToken();

		beforeEach(() => {
			writeWranglerConfig({
				name: "test-worker",
				workers_dev: false,
				preview_urls: false,
			});
			msw.use(
				http.get(
					"*/workers/services/test-worker/environments/production/routes",
					() => HttpResponse.json(createFetchResult([]))
				),
				http.get("*/workers/domains/records", () =>
					HttpResponse.json(createFetchResult([]))
				),
				http.get("*/workers/workers/test-worker", () =>
					HttpResponse.json(
						createFetchResult({
							subdomain: { enabled: false, previews_enabled: false },
						})
					)
				),
				http.get("*/workers/scripts/test-worker/schedules", () =>
					HttpResponse.json(createFetchResult({ schedules: [] }))
				)
			);
		});

		it("authenticates a diff-only dry run and does not deploy", async ({
			expect,
		}) => {
			let requests = 0;
			msw.use(
				http.get("*/workers/scripts/test-worker/schedules", ({ request }) => {
					expect(request.headers.get("Authorization")).toBe(
						"Bearer some-api-token"
					);
					requests++;
					return HttpResponse.json(
						createFetchResult({ schedules: [{ cron: "0 0 * * *" }] })
					);
				})
			);

			await runWrangler(
				"triggers deploy --dry-run --show-diff --triggers '5 0 * * *'"
			);

			expect(requests).toBe(1);
			expect(std.out).toContain("Trigger changes (remote → local):");
			expect(std.out).toContain('-    "0 0 * * *"');
			expect(std.out).toContain('+    "5 0 * * *"');
			expect(std.out).toContain("--dry-run: exiting now.");
		});

		it("reports an unchanged configuration", async ({ expect }) => {
			await runWrangler("triggers deploy --dry-run --show-diff");

			expect(std.out).toContain(
				"No changes detected to routes, custom domains, cron schedules, workers.dev, or Preview URLs."
			);
			expect(std.out).toContain("--dry-run: exiting now.");
		});

		it.for<RawConfig>([
			{ queues: { consumers: [{ queue: "test-queue" }] } },
			{
				workflows: [
					{ binding: "WORKFLOW", name: "workflow", class_name: "Workflow" },
				],
				triggers: {
					events: [
						{
							type: "cf.artifacts.repo.pushed",
							targets: [{ type: "workflow", workflow_name: "workflow" }],
						},
					],
				},
			},
		])(
			"names the compared settings when other triggers change (%j)",
			async (config, { expect }) => {
				writeWranglerConfig({
					name: "test-worker",
					workers_dev: false,
					preview_urls: false,
					...config,
				});

				await runWrangler("triggers deploy --dry-run --show-diff");

				expect(std.out).toContain(
					"No changes detected to routes, custom domains, cron schedules, workers.dev, or Preview URLs."
				);
				expect(std.out).not.toContain("No trigger changes detected.");
			}
		);

		it.for([7, 6])(
			"compares all pages of custom domains with %i local domains",
			async (localCount, { expect }) => {
				const domains = Array.from({ length: 7 }, (_, index) => ({
					hostname: `domain${index}.example.com`,
					zone_id: "example-com-id",
					zone_name: "example.com",
					enabled: true,
					previews_enabled: false,
				}));
				writeWranglerConfig({
					name: "test-worker",
					workers_dev: false,
					preview_urls: false,
					routes: domains.slice(0, localCount).map(({ hostname }) => ({
						pattern: hostname,
						custom_domain: true,
					})),
				});
				const pages: number[] = [];
				msw.use(
					http.get("*/workers/domains/records", ({ request }) => {
						const searchParams = new URL(request.url).searchParams;
						expect(searchParams.get("service")).toBe("test-worker");
						expect(searchParams.get("environment")).toBe("production");
						const page = Number(searchParams.get("page"));
						pages.push(page);
						return HttpResponse.json(
							createFetchResult(
								domains.slice((page - 1) * 5, page * 5),
								true,
								[],
								[],
								{ page, per_page: 5, total_count: domains.length }
							)
						);
					})
				);

				await runWrangler("triggers deploy --dry-run --show-diff");

				expect(pages).toEqual([1, 2]);
				if (localCount === domains.length) {
					expect(std.out).toContain(
						"No changes detected to routes, custom domains, cron schedules, workers.dev, or Preview URLs."
					);
				} else {
					expect(std.out).toContain("Trigger changes (remote → local):");
					expect(std.out).toContain("domain6.example.com");
				}
			}
		);
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
