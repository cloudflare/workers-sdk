import { beforeEach, describe, test, vi } from "vitest";
import { readBuildOutputWorkers } from "../build-output-preview";
import type { BuildOutputWorker } from "@cloudflare/build-output-utils";

const { readBuildOutputMock } = vi.hoisted(() => ({
	readBuildOutputMock: vi.fn(),
}));

vi.mock("@cloudflare/build-output-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/build-output-utils")>()),
	readBuildOutput: readBuildOutputMock,
}));

function createWorker(name: string): BuildOutputWorker {
	return {
		configPath: `/project/${name}/config.json`,
		config: {
			type: "worker",
			name,
			compatibilityDate: "2024-12-30",
		},
		bundleDir: `/project/${name}/bundle`,
		assetsDir: undefined,
	};
}

describe("readBuildOutputWorkers", () => {
	beforeEach(() => {
		readBuildOutputMock.mockReset();
	});

	test("selects the default and auxiliary Workers for preview", async ({
		expect,
	}) => {
		readBuildOutputMock.mockResolvedValue({
			settings: undefined,
			workers: {
				default: createWorker("entry-worker"),
				"auxiliary-worker": createWorker("auxiliary-worker"),
				prerender: createWorker("prerender-worker"),
			},
		});

		const result = await readBuildOutputWorkers("/project", false);

		expect(result.map((worker) => worker.config.name)).toEqual([
			"entry-worker",
			"auxiliary-worker",
		]);
	});

	test("replaces the default Worker while retaining auxiliary Workers during prerendering", async ({
		expect,
	}) => {
		readBuildOutputMock.mockResolvedValue({
			settings: undefined,
			workers: {
				default: createWorker("entry-worker"),
				"auxiliary-worker": createWorker("auxiliary-worker"),
				prerender: createWorker("prerender-worker"),
			},
		});

		const result = await readBuildOutputWorkers("/project", true);

		expect(result.map((worker) => worker.config.name)).toEqual([
			"prerender-worker",
			"auxiliary-worker",
		]);
	});

	test("falls back to the default Worker when no prerender Worker exists", async ({
		expect,
	}) => {
		readBuildOutputMock.mockResolvedValue({
			settings: undefined,
			workers: {
				default: createWorker("entry-worker"),
				"auxiliary-worker": createWorker("auxiliary-worker"),
			},
		});

		const result = await readBuildOutputWorkers("/project", true);

		expect(result.map((worker) => worker.config.name)).toEqual([
			"entry-worker",
			"auxiliary-worker",
		]);
	});
});
