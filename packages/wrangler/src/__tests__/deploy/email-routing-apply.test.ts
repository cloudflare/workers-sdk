import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it } from "vitest";
import { applyEmailRoutingAddresses } from "../../email-routing/apply";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { createFetchResult, msw } from "../helpers/msw";
import type { EmailRoutingPlanResponse } from "../../email-routing/plan";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Unit tests for the apply orchestrator, driven directly (not through
 * `wrangler deploy`) so they stay decoupled from the deploy pipeline. The plan
 * endpoint and the per-zone rule endpoints are mocked with MSW; `config` only
 * needs `addresses` plus the (defaulted) compliance fields `fetchResult` reads.
 */

const ACCOUNT_ID = "some-account-id";
const WORKER_TAG = "a7e6fb77503c41d8a7f3113c6918f10c";
const WORKER_NAME = "test-name";

function testConfig(addresses: string[]): Config {
	return { addresses } as unknown as Config;
}

interface RuleWrites {
	posts: unknown[];
	puts: { id: string; body: unknown }[];
	deletes: string[];
	catchAlls: unknown[];
}

describe("applyEmailRoutingAddresses", () => {
	mockAccountId();
	mockApiToken();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
	});

	function mockPlan(
		plan: EmailRoutingPlanResponse,
		captured?: { body?: unknown }
	) {
		msw.use(
			http.post(
				"*/accounts/:accountId/email/routing/rules/plan",
				async ({ request }) => {
					if (captured) {
						captured.body = await request.json();
					}
					return HttpResponse.json(createFetchResult(plan));
				}
			)
		);
	}

	function mockRuleWrites(writes: RuleWrites, failTarget?: string) {
		msw.use(
			http.post("*/zones/:zoneId/email/routing/rules", async ({ request }) => {
				const body = (await request.json()) as {
					matchers: { value?: string }[];
				};
				writes.posts.push(body);
				if (failTarget && body.matchers[0]?.value === failTarget) {
					return HttpResponse.json(
						createFetchResult(null, false, [
							{ code: 2014, message: "duplicate rule" },
						]),
						{ status: 409 }
					);
				}
				return HttpResponse.json(createFetchResult({ tag: "new-rule-id" }));
			}),
			http.put(
				"*/zones/:zoneId/email/routing/rules/catch_all",
				async ({ request }) => {
					writes.catchAlls.push(await request.json());
					return HttpResponse.json(createFetchResult({}));
				}
			),
			http.put(
				"*/zones/:zoneId/email/routing/rules/:ruleId",
				async ({ request, params }) => {
					writes.puts.push({
						id: String(params.ruleId),
						body: await request.json(),
					});
					return HttpResponse.json(createFetchResult({}));
				}
			),
			http.delete(
				"*/zones/:zoneId/email/routing/rules/:ruleId",
				async ({ params }) => {
					writes.deletes.push(String(params.ruleId));
					return HttpResponse.json(createFetchResult({}));
				}
			)
		);
	}

	function emptyWrites(): RuleWrites {
		return { posts: [], puts: [], deletes: [], catchAlls: [] };
	}

	function apply(addresses: string[], workerTag: string | null = WORKER_TAG) {
		return applyEmailRoutingAddresses({
			config: testConfig(addresses),
			accountId: ACCOUNT_ID,
			scriptName: WORKER_NAME,
			workerTag,
		});
	}

	it("applies an additive plan without prompting", async ({ expect }) => {
		const planBody: { body?: unknown } = {};
		mockPlan(
			{
				zones: [
					{
						zone_id: "zone1",
						zone_name: "example.com",
						changes: [{ type: "added", target: "support@example.com" }],
					},
				],
			},
			planBody
		);
		const writes = emptyWrites();
		mockRuleWrites(writes);

		await apply(["support@example.com"]);

		// Plan request carried the deploying Worker's tag.
		expect(planBody.body).toMatchObject({ owner_worker_tag: WORKER_TAG });
		expect(std.out).toContain("Email Routing plan:");
		expect(std.out).toContain("+ support@example.com -> worker (test-name)");
		expect(std.out).toContain("Email Routing addresses applied.");
		expect(writes.posts).toHaveLength(1);
		expect(writes.posts[0]).toMatchObject({
			source: "wrangler",
			owner_worker_tag: WORKER_TAG,
			matchers: [
				{ type: "literal", field: "to", value: "support@example.com" },
			],
			actions: [{ type: "worker", value: [WORKER_NAME] }],
		});
		expect(std.err).toBe("");
	});

	it("resolves the Worker tag from the API when not provided", async ({
		expect,
	}) => {
		msw.use(
			http.get("*/accounts/:accountId/workers/services/:scriptName", () =>
				HttpResponse.json(
					createFetchResult({
						default_environment: { script: { tag: WORKER_TAG } },
					})
				)
			)
		);
		const planBody: { body?: unknown } = {};
		mockPlan({ zones: [] }, planBody);

		await apply(["support@example.com"], null);

		expect(planBody.body).toMatchObject({ owner_worker_tag: WORKER_TAG });
		expect(std.out).toContain("Email Routing addresses already up to date.");
	});

	it("reports when addresses are already up to date", async ({ expect }) => {
		mockPlan({ zones: [] });

		await apply(["support@example.com"]);

		expect(std.out).toContain("Email Routing addresses already up to date.");
	});

	it("applies a destructive plan after interactive confirmation", async ({
		expect,
	}) => {
		mockConfirm({
			text: "Apply these Email Routing changes (including the destructive ones above)?",
			result: true,
		});
		mockPlan({
			zones: [
				{
					zone_id: "zone1",
					zone_name: "example.com",
					changes: [
						{
							type: "conflict",
							target: "support@example.com",
							remote: {
								id: "existing-rule-id",
								source: "api",
								matchers: [
									{
										type: "literal",
										field: "to",
										value: "support@example.com",
									},
								],
								actions: [{ type: "forward", value: ["a@b.com"] }],
							},
						},
					],
				},
			],
		});
		const writes = emptyWrites();
		mockRuleWrites(writes);

		await apply(["support@example.com"]);

		// Takeover applied via PUT to the existing rule id, with ownership.
		expect(writes.puts).toHaveLength(1);
		expect(writes.puts[0].id).toBe("existing-rule-id");
		expect(writes.puts[0].body).toMatchObject({
			source: "wrangler",
			owner_worker_tag: WORKER_TAG,
		});
		expect(std.out).toContain("Email Routing addresses applied.");
	});

	it("aborts (non-zero) when a destructive plan is declined", async ({
		expect,
	}) => {
		mockConfirm({
			text: "Apply these Email Routing changes (including the destructive ones above)?",
			result: false,
		});
		mockPlan({
			zones: [
				{
					zone_id: "zone1",
					changes: [{ type: "deleted", target: "old@example.com" }],
				},
			],
		});

		await expect(apply(["support@example.com"])).rejects.toThrowError(
			/Email Routing changes were declined/
		);
	});

	it("hard-fails on destructive changes in non-interactive mode", async ({
		expect,
	}) => {
		setIsTTY(false);
		mockPlan({
			zones: [
				{
					zone_id: "zone1",
					changes: [{ type: "deleted", target: "old@example.com" }],
				},
			],
		});

		await expect(apply(["support@example.com"])).rejects.toThrowError(
			/destructive changes .* need confirmation/
		);
	});

	it("reports partial success (non-zero) when a change fails to apply", async ({
		expect,
	}) => {
		mockPlan({
			zones: [
				{
					zone_id: "zone1",
					zone_name: "example.com",
					changes: [
						{ type: "added", target: "ok@example.com" },
						{ type: "added", target: "bad@example.com" },
					],
				},
			],
		});
		const writes = emptyWrites();
		mockRuleWrites(writes, "bad@example.com");

		await expect(
			apply(["ok@example.com", "bad@example.com"])
		).rejects.toThrowError(
			/Email Routing was not fully applied \(1 change\(s\) failed\)/
		);
	});

	it("applies an 'updated' change via PUT to the existing rule (no prompt)", async ({
		expect,
	}) => {
		mockPlan({
			zones: [
				{
					zone_id: "zone1",
					zone_name: "example.com",
					changes: [
						{
							type: "updated",
							target: "support@example.com",
							remote: {
								id: "existing-id",
								source: "wrangler",
								matchers: [
									{
										type: "literal",
										field: "to",
										value: "support@example.com",
									},
								],
								actions: [{ type: "worker", value: [WORKER_NAME] }],
							},
						},
					],
				},
			],
		});
		const writes = emptyWrites();
		mockRuleWrites(writes);

		await apply(["support@example.com"]);

		expect(writes.posts).toHaveLength(0);
		expect(writes.puts).toHaveLength(1);
		expect(writes.puts[0].id).toBe("existing-id");
		expect(writes.puts[0].body).toMatchObject({
			source: "wrangler",
			owner_worker_tag: WORKER_TAG,
			matchers: [
				{ type: "literal", field: "to", value: "support@example.com" },
			],
			actions: [{ type: "worker", value: [WORKER_NAME] }],
		});
		expect(std.out).toContain("Email Routing addresses applied.");
	});

	it("writes the catch-all via PUT with ownership when added", async ({
		expect,
	}) => {
		mockPlan({
			zones: [
				{
					zone_id: "zone1",
					zone_name: "example.com",
					changes: [{ type: "added", target: "*@example.com" }],
				},
			],
		});
		const writes = emptyWrites();
		mockRuleWrites(writes);

		await apply(["*@example.com"]);

		expect(writes.posts).toHaveLength(0);
		expect(writes.catchAlls).toHaveLength(1);
		expect(writes.catchAlls[0]).toMatchObject({
			source: "wrangler",
			owner_worker_tag: WORKER_TAG,
			enabled: true,
			matchers: [{ type: "all" }],
			actions: [{ type: "worker", value: [WORKER_NAME] }],
		});
	});

	it("resets the catch-all to the disabled-drop default on delete", async ({
		expect,
	}) => {
		mockConfirm({
			text: "Apply these Email Routing changes (including the destructive ones above)?",
			result: true,
		});
		mockPlan({
			zones: [
				{
					zone_id: "zone1",
					zone_name: "example.com",
					changes: [{ type: "deleted", target: "*@example.com" }],
				},
			],
		});
		const writes = emptyWrites();
		mockRuleWrites(writes);

		await apply(["support@example.com"]);

		// Catch-all has no DELETE endpoint: a delete resets to the generated
		// default and clears ownership (source=api), never a DELETE call.
		expect(writes.deletes).toHaveLength(0);
		expect(writes.catchAlls).toHaveLength(1);
		expect(writes.catchAlls[0]).toMatchObject({
			source: "api",
			enabled: false,
			name: "",
			matchers: [{ type: "all" }],
			actions: [{ type: "drop" }],
		});
	});

	it("reports failure when the plan omits the rule id for an update", async ({
		expect,
	}) => {
		mockPlan({
			zones: [
				{
					zone_id: "zone1",
					zone_name: "example.com",
					changes: [
						{
							type: "updated",
							target: "support@example.com",
							remote: {
								matchers: [
									{
										type: "literal",
										field: "to",
										value: "support@example.com",
									},
								],
								actions: [{ type: "worker", value: [WORKER_NAME] }],
							},
						},
					],
				},
			],
		});
		const writes = emptyWrites();
		mockRuleWrites(writes);

		await expect(apply(["support@example.com"])).rejects.toThrowError(
			/Email Routing was not fully applied/
		);
		expect(std.err).toContain("missing the rule id");
		expect(writes.puts).toHaveLength(0);
	});

	it("applies a mixed multi-zone plan: add + catch-all + delete + update", async ({
		expect,
	}) => {
		mockConfirm({
			text: "Apply these Email Routing changes (including the destructive ones above)?",
			result: true,
		});
		mockPlan({
			zones: [
				{
					zone_id: "zone1",
					zone_name: "example.com",
					changes: [
						{ type: "added", target: "new@example.com" },
						{ type: "added", target: "*@example.com" },
						{
							type: "deleted",
							target: "old@example.com",
							remote: {
								id: "old-1",
								matchers: [
									{ type: "literal", field: "to", value: "old@example.com" },
								],
								actions: [{ type: "worker", value: [WORKER_NAME] }],
							},
						},
					],
				},
				{
					zone_id: "zone2",
					zone_name: "example.net",
					changes: [
						{
							type: "updated",
							target: "keep@example.net",
							remote: {
								id: "keep-1",
								source: "wrangler",
								matchers: [
									{ type: "literal", field: "to", value: "keep@example.net" },
								],
								actions: [{ type: "worker", value: [WORKER_NAME] }],
							},
						},
					],
				},
			],
		});
		const writes = emptyWrites();
		mockRuleWrites(writes);

		await apply(["new@example.com", "*@example.com", "keep@example.net"]);

		expect(writes.posts).toHaveLength(1); // new@ literal create
		expect(writes.catchAlls).toHaveLength(1); // *@ catch-all PUT
		expect(writes.deletes).toEqual(["old-1"]); // literal delete by id
		expect(writes.puts.map((p) => p.id)).toEqual(["keep-1"]); // update by id
		expect(std.out).toContain("Email Routing addresses applied.");
	});
});
