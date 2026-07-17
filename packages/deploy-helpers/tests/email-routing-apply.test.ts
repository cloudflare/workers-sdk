import { APIError } from "@cloudflare/workers-utils";
import { beforeEach, describe, it, vi } from "vitest";
import { initDeployHelpersContext } from "../src/shared/context";
import { applyEmailRoutingAddresses } from "../src/triggers/email-routing";
import type { EmailRoutingPlanResponse } from "../src/triggers/email-routing-plan";
import type { Config } from "@cloudflare/workers-utils";

const { isNonInteractiveOrCI } = vi.hoisted(() => ({
	isNonInteractiveOrCI: vi.fn(() => true),
}));

vi.mock("@cloudflare/workers-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/workers-utils")>()),
	isNonInteractiveOrCI,
}));

const ACCOUNT_ID = "some-account-id";
const WORKER_TAG = "a7e6fb77503c41d8a7f3113c6918f10c";
const WORKER_NAME = "test-name";
const PLAN_RETRY_DELAY_MS = 3_000;

interface RuleWrites {
	posts: unknown[];
	puts: { id: string; body: unknown }[];
	deletes: string[];
	catchAlls: unknown[];
}

function testConfig(addresses: string[]): Config {
	return { addresses } as unknown as Config;
}

describe("applyEmailRoutingAddresses", () => {
	let plan: EmailRoutingPlanResponse;
	let writes: RuleWrites;
	let logs: string[];
	let errors: string[];
	let confirmResult: boolean;
	let confirmRequests: number;
	let nonInteractive: boolean;
	let failTarget: string | undefined;
	let metadataRequests: number;
	let metadataFailures: number[];
	let planFailures: APIError[];
	let planBody: unknown;

	beforeEach(() => {
		plan = { zones: [] };
		writes = { posts: [], puts: [], deletes: [], catchAlls: [] };
		logs = [];
		errors = [];
		confirmResult = true;
		confirmRequests = 0;
		nonInteractive = true;
		isNonInteractiveOrCI.mockImplementation(() => nonInteractive);
		failTarget = undefined;
		metadataRequests = 0;
		metadataFailures = [];
		planFailures = [];
		planBody = undefined;

		initDeployHelpersContext({
			logger: {
				debug() {},
				info() {},
				warn() {},
				log: (...args) => logs.push(args.join(" ")),
				error: (...args) => errors.push(args.join(" ")),
			},
			fetchResult: fetchResult as never,
			fetchListResult: (() => {}) as never,
			fetchPagedListResult: (() => {}) as never,
			fetchKVGetValue: (() => {}) as never,
			confirm: async () => {
				confirmRequests++;
				return confirmResult;
			},
			prompt: (() => {}) as never,
			select: (() => {}) as never,
		});
	});

	async function fetchResult(
		_config: Config,
		path: string,
		init?: RequestInit
	): Promise<unknown> {
		const body =
			typeof init?.body === "string" ? JSON.parse(init.body) : undefined;

		if (path.endsWith(`/workers/services/${WORKER_NAME}`)) {
			metadataRequests++;
			const code = metadataFailures.shift();
			if (code !== undefined) {
				throw { code };
			}
			return { default_environment: { script: { tag: WORKER_TAG } } };
		}
		if (path.endsWith("/email/routing/rules/plan")) {
			const error = planFailures.shift();
			if (error) {
				throw error;
			}
			planBody = body;
			return plan;
		}
		if (path.endsWith("/email/routing/rules/catch_all")) {
			writes.catchAlls.push(body);
			return {};
		}
		if (init?.method === "POST" && path.endsWith("/email/routing/rules")) {
			const target = (body as { matchers: { value?: string }[] }).matchers[0]
				?.value;
			if (target === failTarget) {
				throw new Error("duplicate rule");
			}
			writes.posts.push(body);
			return {};
		}
		const ruleId = path.split("/").at(-1);
		if (init?.method === "PUT" && ruleId) {
			writes.puts.push({ id: ruleId, body });
			return {};
		}
		if (init?.method === "DELETE" && ruleId) {
			writes.deletes.push(ruleId);
			return {};
		}
		throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${path}`);
	}

	function apply(addresses: string[], workerTag: string | null = WORKER_TAG) {
		return applyEmailRoutingAddresses({
			config: testConfig(addresses),
			accountId: ACCOUNT_ID,
			scriptName: WORKER_NAME,
			workerTag,
		});
	}

	it("skips reconciliation when addresses are absent", async ({ expect }) => {
		await applyEmailRoutingAddresses({
			config: {} as Config,
			accountId: ACCOUNT_ID,
			scriptName: WORKER_NAME,
		});

		expect(planBody).toBeUndefined();
	});

	it("applies an additive plan with ownership and progress", async ({
		expect,
	}) => {
		plan = {
			zones: [
				{
					zone_id: "zone1",
					zone_name: "example.com",
					changes: [{ type: "added", target: "support@example.com" }],
				},
			],
		};

		await apply(["support@example.com"]);

		expect(planBody).toMatchObject({ owner_worker_tag: WORKER_TAG });
		expect(writes.posts).toHaveLength(1);
		expect(writes.posts[0]).toMatchObject({
			source: "wrangler",
			owner_worker_tag: WORKER_TAG,
			matchers: [
				{ type: "literal", field: "to", value: "support@example.com" },
			],
			actions: [{ type: "worker", value: [WORKER_NAME] }],
		});
		expect(logs.join("\n")).toContain(
			"Applying Email Routing changes (1/1, 100%)"
		);
		expect(logs.join("\n")).toContain("Email Routing addresses applied.");
		expect(confirmRequests).toBe(0);
	});

	it("resolves the Worker tag when standalone trigger deployment omits it", async ({
		expect,
	}) => {
		await apply(["support@example.com"], null);

		expect(metadataRequests).toBe(1);
		expect(planBody).toMatchObject({ owner_worker_tag: WORKER_TAG });
		expect(logs.join("\n")).toContain("Email Routing rules are up to date.");
	});

	it("retries Worker metadata while a new Worker propagates", async ({
		expect,
	}) => {
		vi.useFakeTimers();
		metadataFailures = [10007];

		try {
			const applying = apply(["support@example.com"], null);
			await vi.advanceTimersByTimeAsync(PLAN_RETRY_DELAY_MS);
			await applying;
			expect(metadataRequests).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("retries the plan while the Worker propagates to Email Routing", async ({
		expect,
	}) => {
		vi.useFakeTimers();
		const error = new APIError({
			status: 404,
			text: "worker not found",
			telemetryMessage: false,
		});
		error.code = 2016;
		planFailures = [error];

		try {
			const applying = apply(["support@example.com"]);
			await vi.advanceTimersByTimeAsync(PLAN_RETRY_DELAY_MS);
			await applying;
			expect(planBody).toMatchObject({ owner_worker_tag: WORKER_TAG });
		} finally {
			vi.useRealTimers();
		}
	});

	it("applies a destructive takeover after confirmation", async ({
		expect,
	}) => {
		nonInteractive = false;
		plan = {
			zones: [
				{
					zone_id: "zone1",
					changes: [
						{
							type: "conflict",
							target: "support@example.com",
							remote: {
								id: "existing-rule-id",
								matchers: [],
								actions: [{ type: "forward", value: ["a@b.com"] }],
							},
						},
					],
				},
				{
					zone_id: "zone2",
					changes: [
						{
							type: "deleted",
							target: "old@example.net",
							remote: { id: "old-rule-id", matchers: [], actions: [] },
						},
					],
				},
			],
		};

		await apply(["support@example.com"]);

		expect(writes.puts).toEqual([
			expect.objectContaining({
				id: "existing-rule-id",
				body: expect.objectContaining({ owner_worker_tag: WORKER_TAG }),
			}),
		]);
		expect(writes.deletes).toEqual(["old-rule-id"]);
		expect(confirmRequests).toBe(1);
	});

	it("does not write rules when destructive changes are declined", async ({
		expect,
	}) => {
		nonInteractive = false;
		confirmResult = false;
		plan = {
			zones: [
				{
					zone_id: "zone1",
					changes: [
						{
							type: "deleted",
							target: "old@example.com",
							remote: { id: "old-rule-id", matchers: [], actions: [] },
						},
					],
				},
			],
		};

		await expect(apply([])).rejects.toThrow(/changes were declined/);
		expect(confirmRequests).toBe(1);
		expect(writes).toEqual({
			posts: [],
			puts: [],
			deletes: [],
			catchAlls: [],
		});
	});

	it("rejects destructive changes non-interactively", async ({ expect }) => {
		plan = {
			zones: [
				{
					zone_id: "zone1",
					changes: [{ type: "deleted", target: "old@example.com" }],
				},
			],
		};

		await expect(apply([])).rejects.toThrow(
			/destructive changes .* need confirmation/
		);
		expect(writes.deletes).toEqual([]);
		expect(confirmRequests).toBe(0);
	});

	it("resets a deleted catch-all to the disabled default", async ({
		expect,
	}) => {
		nonInteractive = false;
		plan = {
			zones: [
				{
					zone_id: "zone1",
					changes: [{ type: "deleted", target: "*@example.com" }],
				},
			],
		};

		await apply([]);

		expect(writes.catchAlls).toEqual([
			expect.objectContaining({
				source: "api",
				enabled: false,
				matchers: [{ type: "all" }],
				actions: [{ type: "drop" }],
			}),
		]);
		expect(writes.deletes).toEqual([]);
	});

	it("continues applying changes and reports partial failure", async ({
		expect,
	}) => {
		failTarget = "bad@example.com";
		plan = {
			zones: [
				{
					zone_id: "zone1",
					changes: [
						{ type: "added", target: "bad@example.com" },
						{ type: "added", target: "ok@example.com" },
					],
				},
			],
		};

		await expect(apply(["bad@example.com", "ok@example.com"])).rejects.toThrow(
			/Email Routing was not fully applied/
		);
		expect(writes.posts).toHaveLength(1);
		expect(errors.join("\n")).toContain("bad@example.com: duplicate rule");
	});

	it("reports a missing remote rule id as an apply failure", async ({
		expect,
	}) => {
		plan = {
			zones: [
				{
					zone_id: "zone1",
					changes: [
						{
							type: "updated",
							target: "support@example.com",
							remote: { matchers: [], actions: [] },
						},
					],
				},
			],
		};

		await expect(apply(["support@example.com"])).rejects.toThrow(
			/Email Routing was not fully applied/
		);
		expect(errors.join("\n")).toContain("missing the rule id");
	});
});
