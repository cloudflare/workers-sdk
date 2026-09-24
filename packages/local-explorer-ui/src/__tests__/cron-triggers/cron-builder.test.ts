import { describe, it } from "vitest";
import {
	changeCronBuilderKind,
	cronBuilderKinds,
	generateCronExpression,
	isCronBuilderDraft,
} from "../../components/cron-triggers/cron-builder";

describe("isCronBuilderDraft", () => {
	it("accepts every builder shape", ({ expect }) => {
		for (const kind of cronBuilderKinds) {
			expect(isCronBuilderDraft(changeCronBuilderKind(kind.value))).toBe(true);
		}
	});

	it("rejects unknown, incomplete, and malformed builder state", ({
		expect,
	}) => {
		expect(isCronBuilderDraft({ kind: "unknown" })).toBe(false);
		expect(isCronBuilderDraft({ kind: "daily", hour: "0" })).toBe(false);
		expect(
			isCronBuilderDraft({
				kind: "daily",
				hour: "0",
				minute: "0",
				unknown: true,
			})
		).toBe(false);
		expect(
			isCronBuilderDraft({
				kind: "weekdays",
				weekdays: ["mon", "mon"],
				hour: "0",
				minute: "0",
			})
		).toBe(false);
		expect(
			isCronBuilderDraft({
				kind: "last-named-weekday",
				weekday: "not-a-weekday",
				hour: "0",
				minute: "0",
			})
		).toBe(false);
	});
});

describe("generateCronExpression", () => {
	it("generates interval and calendar expressions", ({ expect }) => {
		expect(
			generateCronExpression({ kind: "minute-interval", every: "05" })
		).toEqual({ expression: "*/5 * * * *", errors: {} });
		expect(
			generateCronExpression({
				kind: "month-interval",
				every: "3",
				dayOfMonth: "31",
				hour: "09",
				minute: "00",
			})
		).toEqual({ expression: "0 9 31 */3 *", errors: {} });
	});

	it("sorts weekday lists and generates Cloudflare extensions", ({
		expect,
	}) => {
		expect(
			generateCronExpression({
				kind: "weekdays",
				weekdays: ["fri", "mon", "sun"],
				hour: "17",
				minute: "0",
			}).expression
		).toBe("0 17 * * sun,mon,fri");
		expect(
			generateCronExpression({
				kind: "nearest-weekday",
				dayOfMonth: "15",
				hour: "9",
				minute: "0",
			}).expression
		).toBe("0 9 15W * *");
		expect(
			generateCronExpression({
				kind: "last-weekday-of-month",
				hour: "23",
				minute: "59",
			}).expression
		).toBe("59 23 LW * *");
		expect(
			generateCronExpression({
				kind: "nth-weekday",
				weekday: "mon",
				occurrence: "2",
				hour: "8",
				minute: "30",
			}).expression
		).toBe("30 8 * * mon#2");
	});

	it("preserves invalid drafts and reports every invalid field", ({
		expect,
	}) => {
		const result = generateCronExpression({
			kind: "day-of-month-interval",
			every: "",
			hour: "24",
			minute: "-1",
		});
		expect(result.expression).toBeUndefined();
		expect(Object.keys(result.errors).sort()).toEqual([
			"every",
			"hour",
			"minute",
		]);
	});
});
