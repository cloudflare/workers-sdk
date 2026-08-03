import { describe, test } from "vitest";
import {
	getStepDisplayName,
	getStepKey,
} from "../../components/workflows/StepRow";
import { getRestartFromStepParam } from "../../components/workflows/types";

describe("getStepKey", () => {
	test("produces key from type and name", ({ expect }) => {
		expect(getStepKey({ type: "step", name: "fetch-1" })).toBe("step-fetch-1");
	});

	test("different counter suffixes produce different keys", ({ expect }) => {
		const a = getStepKey({ type: "step", name: "fetch-1" });
		const b = getStepKey({ type: "step", name: "fetch-2" });
		expect(a).not.toBe(b);
	});

	test("same name with different types produce different keys", ({
		expect,
	}) => {
		const a = getStepKey({ type: "step", name: "process-1" });
		const b = getStepKey({ type: "waitForEvent", name: "process-1" });
		expect(a).not.toBe(b);
	});

	test("handles undefined type and name", ({ expect }) => {
		expect(getStepKey({})).toBe("undefined-undefined");
	});
});

describe("getStepDisplayName", () => {
	test("strips trailing counter suffix", ({ expect }) => {
		expect(getStepDisplayName("fetch-1")).toBe("fetch");
	});

	test("strips multi-digit counter suffix", ({ expect }) => {
		expect(getStepDisplayName("fetch-12")).toBe("fetch");
	});

	test("preserves name when no suffix", ({ expect }) => {
		expect(getStepDisplayName("fetch")).toBe("fetch");
	});

	test("only strips the last numeric suffix", ({ expect }) => {
		expect(getStepDisplayName("retry-3-1")).toBe("retry-3");
	});

	test("returns 'Unknown step' for undefined", ({ expect }) => {
		expect(getStepDisplayName(undefined)).toBe("Unknown step");
	});

	test("handles name that is just a number suffix", ({ expect }) => {
		expect(getStepDisplayName("step-0")).toBe("step");
	});
});

describe("getRestartFromStepParam", () => {
	test("strips counter suffix into name + count for do steps", ({ expect }) => {
		expect(
			getRestartFromStepParam({ type: "step", name: "generate-summary-1" })
		).toEqual({ name: "generate-summary", count: 1, type: "do" });
	});

	test("preserves multi-digit counter as count", ({ expect }) => {
		expect(
			getRestartFromStepParam({ type: "step", name: "process-item-12" })
		).toEqual({ name: "process-item", count: 12, type: "do" });
	});

	test("maps sleep step type to sleep", ({ expect }) => {
		expect(getRestartFromStepParam({ type: "sleep", name: "wait-1" })).toEqual({
			name: "wait",
			count: 1,
			type: "sleep",
		});
	});

	test("maps waitForEvent step type to waitForEvent", ({ expect }) => {
		expect(
			getRestartFromStepParam({
				type: "waitForEvent",
				name: "trigger-2",
			})
		).toEqual({ name: "trigger", count: 2, type: "waitForEvent" });
	});

	test("omits count when name has no counter suffix", ({ expect }) => {
		expect(getRestartFromStepParam({ type: "step", name: "greet" })).toEqual({
			name: "greet",
			type: "do",
		});
	});

	test("omits type when step has unknown type", ({ expect }) => {
		expect(getRestartFromStepParam({ name: "foo-1" })).toEqual({
			name: "foo",
			count: 1,
		});
	});

	test("returns empty name when step has no name", ({ expect }) => {
		expect(getRestartFromStepParam({ type: "step" })).toEqual({
			name: "",
			type: "do",
		});
	});
});
