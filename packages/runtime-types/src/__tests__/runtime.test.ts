import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { getRuntimeHeader, RUNTIME_TYPES_MARKER } from "../header";
import { generateRuntimeTypes } from "../runtime";

const OUT_FILE = "worker-configuration.d.ts";

const WORKERD_VERSION = "1.0.0-test";

const { MiniflareMock, dispatchFetchMock, disposeMock } = vi.hoisted(() => {
	const dispatch = vi.fn();
	const dispose = vi.fn();
	const constructor = vi.fn(function () {
		return {
			dispatchFetch: dispatch,
			dispose: dispose,
		};
	});
	return {
		MiniflareMock: constructor,
		dispatchFetchMock: dispatch,
		disposeMock: dispose,
	};
});

vi.mock("workerd", () => ({
	// Must be a literal: vi.mock factories are hoisted above top-level variables.
	version: "1.0.0-test",
	default: "/fake/workerd",
}));
vi.mock("miniflare", () => ({ Miniflare: MiniflareMock }));

describe("generateRuntimeTypes", () => {
	runInTempDir();

	beforeEach(() => {
		vi.clearAllMocks();
		dispatchFetchMock.mockResolvedValue({
			ok: true,
			text: async () => "GENERATED",
		});
	});

	it("generates types when the out file does not exist (cache miss)", async ({
		expect,
	}) => {
		const result = await generateRuntimeTypes({
			compatibilityDate: "2024-11-06",
			outFile: OUT_FILE,
		});

		expect(result).toEqual({
			runtimeHeader: getRuntimeHeader(WORKERD_VERSION, "2024-11-06", []),
			runtimeTypes: "GENERATED",
			isCached: false,
		});
		expect(MiniflareMock).toHaveBeenCalledTimes(1);
	});

	it("strips nodejs_compat flags from the dispatch URL but keeps them in the header", async ({
		expect,
	}) => {
		const result = await generateRuntimeTypes({
			compatibilityDate: "2024-11-06",
			compatibilityFlags: ["nodejs_compat", "flag_b", "flag_a"],
			outFile: OUT_FILE,
		});

		// nodejs_compat flags are stripped from the dispatch URL; the remaining
		// flags keep their original caller-provided order.
		expect(dispatchFetchMock).toHaveBeenCalledWith(
			"http://dummy.com/2024-11-06+flag_b+flag_a"
		);
		expect(result.runtimeHeader).toBe(
			getRuntimeHeader(WORKERD_VERSION, "2024-11-06", [
				"nodejs_compat",
				"flag_b",
				"flag_a",
			])
		);
	});

	it("returns cached types when the header and marker match", async ({
		expect,
	}) => {
		const header = getRuntimeHeader(WORKERD_VERSION, "2024-11-06", ["flag_a"]);
		await seed({
			[OUT_FILE]: `${header}\nsome preamble\n${RUNTIME_TYPES_MARKER}\nCACHED TYPES\nmore`,
		});

		const result = await generateRuntimeTypes({
			compatibilityDate: "2024-11-06",
			compatibilityFlags: ["flag_a"],
			outFile: OUT_FILE,
		});

		expect(result).toEqual({
			runtimeHeader: header,
			runtimeTypes: "CACHED TYPES\nmore",
			isCached: true,
		});
		expect(MiniflareMock).not.toHaveBeenCalled();
	});

	it("regenerates when the cached header is stale", async ({ expect }) => {
		const staleHeader = getRuntimeHeader(WORKERD_VERSION, "2020-01-01", []);
		await seed({
			[OUT_FILE]: `${staleHeader}\n${RUNTIME_TYPES_MARKER}\nOLD`,
		});

		const result = await generateRuntimeTypes({
			compatibilityDate: "2024-11-06",
			outFile: OUT_FILE,
		});

		expect(result.isCached).toBe(false);
		expect(result.runtimeTypes).toBe("GENERATED");
		expect(MiniflareMock).toHaveBeenCalledTimes(1);
	});

	it("regenerates when the marker is missing even if the header matches", async ({
		expect,
	}) => {
		const header = getRuntimeHeader(WORKERD_VERSION, "2024-11-06", []);
		await seed({ [OUT_FILE]: `${header}\nNO MARKER HERE` });

		const result = await generateRuntimeTypes({
			compatibilityDate: "2024-11-06",
			outFile: OUT_FILE,
		});

		expect(result.isCached).toBe(false);
		expect(MiniflareMock).toHaveBeenCalledTimes(1);
	});

	it("rejects and still disposes Miniflare when the response is not ok", async ({
		expect,
	}) => {
		dispatchFetchMock.mockResolvedValue({
			ok: false,
			text: async () => "boom",
		});

		await expect(
			generateRuntimeTypes({
				compatibilityDate: "2024-11-06",
				outFile: OUT_FILE,
			})
		).rejects.toThrow("boom");
		expect(disposeMock).toHaveBeenCalledTimes(1);
	});

	it("rethrows non-ENOENT read errors without generating", async ({
		expect,
	}) => {
		// Passing a directory as the out file triggers EISDIR on read.
		await expect(
			generateRuntimeTypes({ compatibilityDate: "2024-11-06", outFile: "." })
		).rejects.toThrow();
		expect(MiniflareMock).not.toHaveBeenCalled();
	});
});
