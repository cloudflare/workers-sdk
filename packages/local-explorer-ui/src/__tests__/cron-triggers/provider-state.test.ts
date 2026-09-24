import { describe, it } from "vitest";
import {
	createCronStateFromSeed,
	reconcilePersistenceKeysForRefresh,
	RefreshGenerationTracker,
	selectCronFallbackWorker,
	shouldReplaceCustomRowsForPersistenceScope,
} from "../../components/cron-triggers/CronTriggersContext";

describe("Cron Triggers provider state", () => {
	it("treats absent and explicit empty trigger metadata as authoritative empty arrays", ({
		expect,
	}) => {
		const state = createCronStateFromSeed(
			[
				{ isSelf: false, name: "absent" },
				{ isSelf: false, name: "empty", triggers: { crons: [] } },
			],
			true
		);
		expect(state.absent?.authoritative).toBe(true);
		expect(state.absent?.crons).toEqual([]);
		expect(state.absent?.configuredRows).toEqual([]);
		expect(state.absent?.customRows).toEqual([]);
		expect(state.empty?.crons).toEqual([]);
	});

	it("does not claim authority when the root request failed", ({ expect }) => {
		expect(
			createCronStateFromSeed(
				[
					{
						isSelf: true,
						name: "worker",
						triggers: { crons: ["0 0 * * *"] },
					},
				],
				false
			)
		).toEqual({});
	});

	it("retains persistence keys for Workers omitted from a partial refresh", ({
		expect,
	}) => {
		expect(
			reconcilePersistenceKeysForRefresh(
				{
					omitted: "key-for-omitted-worker",
					returned: "old-key-for-returned-worker",
				},
				[
					{
						isSelf: false,
						name: "returned",
						persistenceScope: "new-scope",
					},
				]
			)
		).toEqual({
			omitted: "key-for-omitted-worker",
			returned:
				"local-explorer.cron-triggers.custom-rows.v1.new-scope.returned",
		});
	});

	it("removes a known key when returned metadata explicitly has no scope", ({
		expect,
	}) => {
		expect(
			reconcilePersistenceKeysForRefresh(
				{ returned: "old-key-for-returned-worker" },
				[{ isSelf: false, name: "returned" }]
			)
		).toEqual({});
	});

	it("only replaces drafts when one explicit scope changes to another", ({
		expect,
	}) => {
		expect(
			shouldReplaceCustomRowsForPersistenceScope("scope-a", "scope-b")
		).toBe(true);
		expect(
			shouldReplaceCustomRowsForPersistenceScope("scope-a", "scope-a")
		).toBe(false);
		expect(
			shouldReplaceCustomRowsForPersistenceScope("scope-a", undefined)
		).toBe(false);
		expect(
			shouldReplaceCustomRowsForPersistenceScope(undefined, "scope-a")
		).toBe(false);
		expect(
			shouldReplaceCustomRowsForPersistenceScope(undefined, undefined)
		).toBe(false);
	});

	it("recovers a self-first fallback without exposing internal workers", ({
		expect,
	}) => {
		expect(
			selectCronFallbackWorker([
				{ isSelf: true, name: "__router-worker__" },
				{ isSelf: false, name: "peer" },
				{ isSelf: true, name: "self" },
			])
		).toBe("self");
	});

	it("rejects stale out-of-order refresh generations", ({ expect }) => {
		const tracker = new RefreshGenerationTracker();
		const older = tracker.start("worker") ?? 0;
		const newer = tracker.start("worker") ?? 0;
		expect(tracker.isLatest(newer)).toBe(true);
		expect(tracker.isLatest(older)).toBe(false);
		expect(tracker.finish("worker", older)).toBe(false);
		expect(tracker.finish("worker", newer)).toBe(true);
	});

	it("skips overlapping automatic refreshes for the same Worker", ({
		expect,
	}) => {
		const tracker = new RefreshGenerationTracker();
		const first = tracker.start("worker", true) ?? 0;
		expect(tracker.start("worker", true)).toBeUndefined();
		expect(tracker.start("other-worker", true)).toBeDefined();
		expect(tracker.finish("worker", first)).toBe(true);
		expect(tracker.start("worker", true)).toBeDefined();
	});
});
