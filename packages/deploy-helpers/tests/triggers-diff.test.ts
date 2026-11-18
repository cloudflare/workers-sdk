import { beforeEach, describe, it, vi } from "vitest";
import { initDeployHelpersContext } from "../src/shared/context";
import { triggersDeploy } from "../src/triggers/deploy";
import type { TriggerProps } from "../src/shared/types";
import type { Config, Route } from "@cloudflare/workers-utils";

const ACCOUNT_ID = "some-account-id";
const WORKER_NAME = "test-worker";
const WORKER_URL = `/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`;
const NO_TRIGGER_CHANGES_MESSAGE =
	"No changes detected to routes, custom domains, cron schedules, workers.dev, or Preview URLs.";

function customDomain(hostname = "example.com") {
	return {
		hostname,
		zone_id: "example-com-id",
		zone_name: "example.com",
		enabled: true,
		previews_enabled: false,
	};
}

describe("triggersDeploy showDiff", () => {
	let remoteRoutes: Route[];
	let remoteDomains: ReturnType<typeof customDomain>[];
	let remoteCrons: string[];
	const log = vi.fn();
	const warn = vi.fn();
	const fetchResult = vi.fn();
	const fetchListResult = vi.fn();
	const fetchPagedListResult = vi.fn();

	beforeEach(() => {
		remoteRoutes = [];
		remoteDomains = [];
		remoteCrons = [];
		fetchResult.mockImplementation(
			async (_config: Config, path: string, init?: RequestInit) => {
				if (path.includes("/routes?")) {
					return remoteRoutes;
				}
				if (path === `${WORKER_URL}/schedules`) {
					return init?.method === "PUT"
						? undefined
						: { schedules: remoteCrons.map((cron) => ({ cron })) };
				}
				if (path.endsWith(`/workers/workers/${WORKER_NAME}`)) {
					return {
						subdomain: { enabled: false, previews_enabled: false },
					};
				}
				if (path === `${WORKER_URL}/subdomain` && init?.method === "POST") {
					return { enabled: false, previews_enabled: false };
				}
				throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${path}`);
			}
		);
		fetchListResult.mockResolvedValue([{ id: "example-com-id" }]);
		fetchPagedListResult.mockImplementation(async () => remoteDomains);
		initDeployHelpersContext({
			logger: { log, warn, debug: vi.fn(), info: vi.fn(), error: vi.fn() },
			fetchResult,
			fetchListResult,
			fetchPagedListResult,
			fetchKVGetValue: vi.fn(),
			confirm: vi.fn(),
			prompt: vi.fn(),
			select: vi.fn(),
		});
	});

	function deploy(overrides: Partial<TriggerProps> = {}) {
		return triggersDeploy({
			config: {
				workers_dev: false,
				preview_urls: false,
				queues: { producers: [], consumers: [] },
				workflows: [],
			} as unknown as Config,
			accountId: ACCOUNT_ID,
			scriptName: WORKER_NAME,
			routes: [],
			crons: undefined,
			firstDeploy: false,
			dryRun: true,
			showDiff: true,
			validated: true,
			queueCreateCommand: (queueName) => `wrangler queues create ${queueName}`,
			workersDevConfigFieldName: "workers_dev",
			workersDevConfigAssignment: (value) => `workers_dev = ${value}`,
			previewUrlsConfigFieldName: "preview_urls",
			previewUrlsConfigAssignment: (value) => `preview_urls = ${value}`,
			...overrides,
		});
	}

	it("does not fetch remote state for an ordinary dry run", async ({
		expect,
	}) => {
		await deploy({ showDiff: false, accountId: undefined });
		expect(fetchResult).not.toHaveBeenCalled();
		expect(fetchPagedListResult).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith("--dry-run: exiting now.");
	});

	it("preserves remote categories that deployment skips", async ({
		expect,
	}) => {
		remoteRoutes = [{ pattern: "example.com/*", zone_name: "example.com" }];
		remoteDomains = [customDomain()];
		remoteCrons = ["0 0 * * *"];

		await deploy();

		expect(log).toHaveBeenCalledWith(NO_TRIGGER_CHANGES_MESSAGE);
		expect(fetchResult).toHaveBeenCalledTimes(3);
		expect(fetchPagedListResult).toHaveBeenCalledTimes(1);
		expect(fetchListResult).not.toHaveBeenCalled();
	});

	it.for([
		"example.com/*",
		{ pattern: "example.com/*", zone_name: "example.com" },
		{ pattern: "example.com/*", zone_id: "example-com-id" },
	])("normalizes an unchanged route %j", async (route, { expect }) => {
		remoteRoutes = [{ pattern: "example.com/*", zone_name: "example.com" }];
		remoteDomains = [customDomain()];

		await deploy({ routes: [route] });

		expect(log).toHaveBeenCalledWith(NO_TRIGGER_CHANGES_MESSAGE);
		if (typeof route === "object" && "zone_id" in route) {
			expect(fetchListResult).toHaveBeenCalledWith(
				expect.anything(),
				"/zones",
				expect.anything(),
				new URLSearchParams({ name: "example.com", "account.id": ACCOUNT_ID })
			);
		}
	});

	it.for([
		{ pattern: "example.com", custom_domain: true },
		{ pattern: "example.com", custom_domain: true, zone_name: "example.com" },
		{ pattern: "example.com", custom_domain: true, zone_id: "example-com-id" },
	])("normalizes an unchanged custom domain %j", async (route, { expect }) => {
		remoteRoutes = [{ pattern: "example.com/*", zone_name: "example.com" }];
		remoteDomains = [customDomain()];

		await deploy({ routes: [route] });

		expect(log).toHaveBeenCalledWith(NO_TRIGGER_CHANGES_MESSAGE);
		expect(fetchListResult).not.toHaveBeenCalled();
	});

	it.for([
		{ pattern: "example.com/*", zone_name: "com" },
		{ pattern: "example.com/*", zone_id: "different-zone-id" },
		{ pattern: "example.com", custom_domain: true, zone_name: "com" },
		{
			pattern: "example.com",
			custom_domain: true,
			zone_id: "different-zone-id",
		},
	])("detects a different explicit zone %j", async (route, { expect }) => {
		remoteRoutes = [{ pattern: "example.com/*", zone_name: "example.com" }];
		remoteDomains = [customDomain()];

		await deploy({ routes: [route] });

		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("Trigger changes")
		);
		expect(log).not.toHaveBeenCalledWith(NO_TRIGGER_CHANGES_MESSAGE);
	});

	it.for([{ enabled: false }, { previews_enabled: true }])(
		"detects custom domain enablement changes %j",
		async (settings, { expect }) => {
			remoteDomains = [customDomain()];

			await deploy({
				routes: [{ pattern: "example.com", custom_domain: true, ...settings }],
			});

			expect(log).toHaveBeenCalledWith(
				expect.stringContaining(Object.keys(settings)[0])
			);
			expect(log).not.toHaveBeenCalledWith(NO_TRIGGER_CHANGES_MESSAGE);
		}
	);

	it("resolves omitted custom domain enablement to API defaults", async ({
		expect,
	}) => {
		remoteDomains = [
			{ ...customDomain(), enabled: false, previews_enabled: true },
		];

		await deploy({ routes: [{ pattern: "example.com", custom_domain: true }] });

		expect(log).toHaveBeenCalledWith(expect.stringContaining("enabled"));
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("previews_enabled")
		);
	});

	it("sorts routes, domains and schedules before comparison", async ({
		expect,
	}) => {
		remoteRoutes = [
			{ pattern: "b.example.com/*", zone_name: "example.com" },
			{ pattern: "a.example.com/*", zone_name: "example.com" },
		];
		remoteDomains = [
			customDomain("b.example.com"),
			customDomain("a.example.com"),
		];
		remoteCrons = ["5 * * * *", "0 * * * *"];

		await deploy({
			routes: [
				"a.example.com/*",
				"b.example.com/*",
				{ pattern: "a.example.com", custom_domain: true },
				{ pattern: "b.example.com", custom_domain: true },
			],
			crons: [...remoteCrons].reverse(),
		});

		expect(log).toHaveBeenCalledWith(NO_TRIGGER_CHANGES_MESSAGE);
	});

	it("shows an explicit empty cron list as removing schedules", async ({
		expect,
	}) => {
		remoteCrons = ["0 0 * * *"];

		await deploy({ crons: [] });

		expect(log).toHaveBeenCalledWith(
			expect.stringContaining('-    "0 0 * * *"')
		);
	});

	it("does not show changes when schedules are already empty", async ({
		expect,
	}) => {
		await deploy({ crons: [] });
		expect(log).toHaveBeenCalledWith(NO_TRIGGER_CHANGES_MESSAGE);
	});

	it("fetches all custom domains with the paginated helper", async ({
		expect,
	}) => {
		remoteDomains = Array.from({ length: 7 }, (_, index) =>
			customDomain(`${index}.example.com`)
		);

		await deploy({
			routes: remoteDomains.map(({ hostname }) => ({
				pattern: hostname,
				custom_domain: true,
			})),
		});

		expect(fetchPagedListResult).toHaveBeenCalledWith(
			expect.anything(),
			`/accounts/${ACCOUNT_ID}/workers/domains/records`,
			{},
			new URLSearchParams({ service: WORKER_NAME, environment: "production" })
		);
		expect(log).toHaveBeenCalledWith(NO_TRIGGER_CHANGES_MESSAGE);
	});

	it("displays the diff after a real deployment", async ({ expect }) => {
		remoteCrons = ["0 0 * * *"];

		await deploy({ dryRun: false, crons: ["5 0 * * *"] });

		expect(fetchResult).toHaveBeenCalledWith(
			expect.anything(),
			`${WORKER_URL}/schedules`,
			expect.objectContaining({ method: "PUT", body: '[{"cron":"5 0 * * *"}]' })
		);
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("Trigger changes")
		);
		expect(log).not.toHaveBeenCalledWith("--dry-run: exiting now.");
	});

	it("warns and continues a real deployment when the snapshot fails", async ({
		expect,
	}) => {
		fetchPagedListResult.mockRejectedValue(new Error("Snapshot unavailable"));

		await deploy({ dryRun: false, crons: [] });

		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("continuing with deployment")
		);
		expect(fetchResult).toHaveBeenCalledWith(
			expect.anything(),
			`${WORKER_URL}/schedules`,
			expect.objectContaining({ method: "PUT", body: "[]" })
		);
		expect(log).not.toHaveBeenCalledWith(NO_TRIGGER_CHANGES_MESSAGE);
	});

	it("fails an explicit diff-only dry run when the snapshot is unavailable", async ({
		expect,
	}) => {
		const error = new Error("Snapshot unavailable");
		fetchPagedListResult.mockRejectedValue(error);

		await expect(deploy()).rejects.toBe(error);

		expect(warn).not.toHaveBeenCalled();
		expect(fetchResult.mock.calls.every(([, , init]) => !init?.method)).toBe(
			true
		);
	});
});
