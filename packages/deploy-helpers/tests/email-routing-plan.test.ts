import chalk from "chalk";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
	buildEmailRoutingPlanRequest,
	isDestructiveChange,
	planHasChanges,
	planHasDestructiveChanges,
	renderEmailRoutingPlan,
} from "../src/triggers/email-routing-plan";
import type { EmailRoutingPlanResponse } from "../src/triggers/email-routing-plan";

describe("buildEmailRoutingPlanRequest", () => {
	it("compiles literal addresses into normal rules targeting the worker", ({
		expect,
	}) => {
		const req = buildEmailRoutingPlanRequest(
			["support@example.com"],
			"my-worker",
			"a7e6fb77503c41d8a7f3113c6918f10c"
		);
		expect(req.owner_worker_tag).toBe("a7e6fb77503c41d8a7f3113c6918f10c");
		expect(req.catch_all_rules).toEqual([]);
		expect(req.rules).toEqual([
			{
				matchers: [
					{ type: "literal", field: "to", value: "support@example.com" },
				],
				actions: [{ type: "worker", value: ["my-worker"] }],
			},
		]);
	});

	it("compiles *@domain entries into catch-all rules with a target", ({
		expect,
	}) => {
		const req = buildEmailRoutingPlanRequest(
			["*@example.com"],
			"my-worker",
			"tag"
		);
		expect(req.rules).toEqual([]);
		expect(req.catch_all_rules).toEqual([
			{
				target: "*@example.com",
				rule: {
					matchers: [{ type: "all" }],
					actions: [{ type: "worker", value: ["my-worker"] }],
				},
			},
		]);
	});
});

describe("renderEmailRoutingPlan", () => {
	const originalChalkLevel = chalk.level;

	beforeEach(() => {
		chalk.level = 0;
	});

	afterEach(() => {
		chalk.level = originalChalkLevel;
	});

	const plan: EmailRoutingPlanResponse = {
		zones: [
			{
				zone_id: "zonetag1",
				zone_name: "example.com",
				changes: [
					{ type: "added", target: "support@example.com" },
					{
						type: "conflict",
						target: "billing@example.com",
						remote: {
							id: "r1",
							source: "api",
							matchers: [
								{ type: "literal", field: "to", value: "billing@example.com" },
							],
							actions: [
								{ type: "forward", value: ["billing-team@example.net"] },
							],
						},
					},
				],
			},
			{
				zone_id: "zonetag2",
				zone_name: "example.net",
				changes: [
					{ type: "deleted", target: "old@example.net" },
					{
						type: "conflict",
						target: "*@example.net",
						remote: {
							id: "r2",
							source: "wrangler",
							owner_worker_name: "other-worker",
							matchers: [{ type: "all" }],
							actions: [{ type: "worker", value: ["other-worker"] }],
						},
					},
				],
			},
		],
	};

	it("groups by zone with +/~/-/! markers and a summary line", ({ expect }) => {
		const lines = renderEmailRoutingPlan(plan, "my-worker");
		expect(lines).toEqual([
			"example.com",
			"  + support@example.com -> worker (my-worker)",
			`  ! billing@example.com -> conflict: managed outside Wrangler (forward to billing-team@example.net)`,
			"example.net",
			"  - old@example.net (removed from config)",
			`  ! *@example.net -> conflict: owned by worker "other-worker" (worker other-worker)`,
			"4 changes across 2 zones (1 added, 1 deleted, 2 conflict)",
		]);
	});

	it("colors change markers", ({ expect }) => {
		chalk.level = 1;
		const lines = renderEmailRoutingPlan(
			{
				zones: [
					{
						zone_id: "zone1",
						changes: [
							{ type: "added", target: "add@example.com" },
							{ type: "updated", target: "update@example.com" },
							{ type: "deleted", target: "delete@example.com" },
							{ type: "conflict", target: "conflict@example.com" },
						],
					},
				],
			},
			"my-worker"
		);
		expect(lines[1]).toContain("\u001b[32m+\u001b[39m");
		expect(lines[2]).toContain("\u001b[33m~\u001b[39m");
		expect(lines[3]).toContain("\u001b[31m-\u001b[39m");
		expect(lines[4]).toContain("\u001b[31m!\u001b[39m");
	});

	it("omits zones with no changes", ({ expect }) => {
		const lines = renderEmailRoutingPlan(
			{
				zones: [
					{ zone_id: "z", zone_name: "noop.com", changes: [] },
					{
						zone_id: "z2",
						zone_name: "a.com",
						changes: [{ type: "added", target: "x@a.com" }],
					},
				],
			},
			"my-worker"
		);
		expect(lines).toEqual([
			"a.com",
			"  + x@a.com -> worker (my-worker)",
			"1 change across 1 zone (1 added)",
		]);
	});
});

describe("destructive-change helpers", () => {
	it("treats deletes and conflicts as destructive; added/updated are not", ({
		expect,
	}) => {
		expect(isDestructiveChange({ type: "added", target: "a" })).toBe(false);
		expect(isDestructiveChange({ type: "updated", target: "a" })).toBe(false);
		expect(isDestructiveChange({ type: "deleted", target: "a" })).toBe(true);
		expect(isDestructiveChange({ type: "conflict", target: "a" })).toBe(true);
	});

	it("detects presence of changes / destructive changes across zones", ({
		expect,
	}) => {
		const additive: EmailRoutingPlanResponse = {
			zones: [{ zone_id: "z", changes: [{ type: "added", target: "a" }] }],
		};
		expect(planHasChanges(additive)).toBe(true);
		expect(planHasDestructiveChanges(additive)).toBe(false);

		const withConflict: EmailRoutingPlanResponse = {
			zones: [{ zone_id: "z", changes: [{ type: "conflict", target: "a" }] }],
		};
		expect(planHasDestructiveChanges(withConflict)).toBe(true);

		expect(planHasChanges({ zones: [{ zone_id: "z", changes: [] }] })).toBe(
			false
		);
	});
});
