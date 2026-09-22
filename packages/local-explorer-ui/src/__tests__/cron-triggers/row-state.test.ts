import { describe, it } from "vitest";
import {
	createCronRow,
	reconcileConfiguredRows,
} from "../../components/cron-triggers/row-state";

describe("Cron Trigger row state", () => {
	it("keeps duplicate configured rows stable across reordering", ({
		expect,
	}) => {
		const rows = reconcileConfiguredRows([], ["a", "b", "a"]);
		const reordered = reconcileConfiguredRows(rows, ["a", "a", "b"]);
		const ids = rows.map((row) => row.id);
		expect(reordered.map((row) => row.id)).toEqual([ids[0], ids[2], ids[1]]);
	});

	it("drops removed idle rows and retains settled rows as stale", ({
		expect,
	}) => {
		const rows = reconcileConfiguredRows([], ["idle", "settled"]);
		const settled = rows[1];
		if (!settled) {
			throw new Error("Expected a configured row.");
		}
		rows[1] = {
			...settled,
			invocation: {
				cron: "settled",
				requestId: "request",
				result: { outcome: "ok", noRetry: false },
				scheduledTime: 0,
				status: "result",
			},
		};
		const reconciled = reconcileConfiguredRows(rows, []);
		expect(reconciled).toHaveLength(1);
		expect(reconciled[0]?.source).toBe("no-longer-configured");
	});

	it("never changes custom rows", ({ expect }) => {
		const custom = createCronRow("0 0 * * *");
		custom.invocation = {
			cron: custom.cron,
			requestId: "request",
			scheduledTime: 10,
			status: "error",
			error: "failed",
		};
		const reconciled = reconcileConfiguredRows([custom], ["configured"]);
		expect(reconciled[1]).toBe(custom);
	});
});
