import { BuildOutputError } from "@cloudflare/build-output-utils";
import { beforeEach, describe, test, vi } from "vitest";
import { readBuildOutputPreview } from "../build-output-preview";
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
		configPath: `/project/${name}/worker.config.json`,
		config: {
			name,
			compatibilityDate: "2024-12-30",
		},
		bundleDir: `/project/${name}/bundle`,
		assetsDir: undefined,
	};
}

describe("readBuildOutputPreview", () => {
	beforeEach(() => {
		readBuildOutputMock.mockReset();
	});

	test("selects the default and auxiliary Workers for ordinary preview", async ({
		expect,
	}) => {
		readBuildOutputMock.mockResolvedValue({
			rootConfig: { buildContext: { isPreview: false } },
			containers: [],
			workers: {
				default: createWorker("entry-worker"),
				"auxiliary-worker": createWorker("auxiliary-worker"),
				prerender: createWorker("prerender-worker"),
			},
		});

		const result = await readBuildOutputPreview("/project", false);

		expect(result.workers.map((worker) => worker.config.name)).toEqual([
			"entry-worker",
			"auxiliary-worker",
		]);
	});

	test("replaces the default Worker while retaining auxiliary Workers during prerendering", async ({
		expect,
	}) => {
		readBuildOutputMock.mockResolvedValue({
			rootConfig: { buildContext: { isPreview: false } },
			containers: [],
			workers: {
				default: createWorker("entry-worker"),
				"auxiliary-worker": createWorker("auxiliary-worker"),
				prerender: createWorker("prerender-worker"),
			},
		});

		const result = await readBuildOutputPreview("/project", true);

		expect(result.workers.map((worker) => worker.config.name)).toEqual([
			"prerender-worker",
			"auxiliary-worker",
		]);
	});

	test("falls back to the default Worker when no prerender Worker exists", async ({
		expect,
	}) => {
		readBuildOutputMock.mockResolvedValue({
			rootConfig: { buildContext: { isPreview: false } },
			containers: [],
			workers: {
				default: createWorker("entry-worker"),
				"auxiliary-worker": createWorker("auxiliary-worker"),
			},
		});

		const result = await readBuildOutputPreview("/project", true);

		expect(result.workers.map((worker) => worker.config.name)).toEqual([
			"entry-worker",
			"auxiliary-worker",
		]);
	});

	test("returns parsed Container Build Output without transforming image references", async ({
		expect,
	}) => {
		const container = {
			name: "api",
			image: { localReference: "cloudflare-build/project/api:123" },
		};
		readBuildOutputMock.mockResolvedValue({
			rootConfig: { buildContext: { isPreview: false } },
			containers: [
				{
					configPath: "/project/containers/api/container.config.json",
					config: container,
				},
			],
			workers: { default: createWorker("entry-worker") },
		});

		const result = await readBuildOutputPreview("/project", false);

		expect(result.containers).toEqual([container]);
	});

	test.for([
		{
			code: "not-found",
			foundVersions: [],
			message:
				"No Build Output was found to preview. Build the project, then preview it again.",
		},
		{
			code: "older-version",
			foundVersions: ["v0"],
			message:
				"The Build Output uses the older v0 format. Build the project, then preview it again.",
		},
		{
			code: "multiple-versions",
			foundVersions: ["v0", "v1"],
			message:
				"Build Output was found in more than one format (v0, v1). Build the project, then preview it again.",
		},
	] as const)(
		"asks for a rebuild when the Build Output is $code",
		async ({ code, foundVersions, message }, { expect }) => {
			const cause = new BuildOutputError("original", {
				code,
				foundVersions: [...foundVersions],
				supportedVersions: ["v1"],
			});
			readBuildOutputMock.mockRejectedValue(cause);

			await expect(readBuildOutputPreview("/project", false)).rejects.toThrow(
				expect.objectContaining({ message, cause })
			);
		}
	);

	test.for(["newer-version", "unknown-fields", "invalid"] as const)(
		"passes %s errors through unchanged",
		async (code, { expect }) => {
			const error = new BuildOutputError("original", { code });
			readBuildOutputMock.mockRejectedValue(error);

			await expect(readBuildOutputPreview("/project", false)).rejects.toBe(
				error
			);
		}
	);
});
