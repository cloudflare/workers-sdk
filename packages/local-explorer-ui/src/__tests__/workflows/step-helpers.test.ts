import { describe, test } from "vitest";
import {
	getStepDisplayName,
	getStepKey,
} from "../../components/workflows/StepRow";

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
