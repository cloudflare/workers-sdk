import { randomUUID } from "node:crypto";
import { seed } from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, vi } from "vitest";
import { getWorkerNameFromProject } from "../../../autoconfig/details";
import { runInTempDir } from "../../helpers/run-in-tmp";

describe("autoconfig details - getWorkerNameFromProject()", () => {
	runInTempDir();

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const workerNamesToTest = [
		{ rawName: "my-project-1", normalizedName: "my-project-1" },
		{
			rawName: "--my-other-project%1_",
			normalizedName: "my-other-project-1",
		},
		{
			rawName: "x".repeat(100),
			normalizedName: "x".repeat(63),
		},
	];

	it.for(workerNamesToTest)(
		"should use the directory name as the worker name when no package.json, normalizing if needed (%s)",
		async (
			{ rawName: dirname, normalizedName: expectedWorkerName },
			{ expect }
		) => {
			await seed({
				[`./${dirname}/index.html`]: "<h1>Hello World</h1>",
			});
			expect(getWorkerNameFromProject(`./${dirname}`)).toBe(expectedWorkerName);
		}
	);

	it.for(workerNamesToTest)(
		"should use the name from package.json when available, normalizing if needed (%s)",
		async (
			{ rawName: projectName, normalizedName: expectedWorkerName },
			{ expect }
		) => {
			const dirname = `project-${randomUUID()}`;
			await seed({
				[`./${dirname}/package.json`]: JSON.stringify({ name: projectName }),
			});
			expect(getWorkerNameFromProject(`./${dirname}`)).toBe(expectedWorkerName);
		}
	);

	it("should fall back to directory name when package.json has no name field", async ({
		expect,
	}) => {
		const dirname = "my-test-project";
		await seed({
			[`./${dirname}/package.json`]: JSON.stringify({ version: "1.0.0" }),
		});
		expect(getWorkerNameFromProject(`./${dirname}`)).toBe(dirname);
	});

	it("should fall back to directory name when package.json is invalid", async ({
		expect,
	}) => {
		const dirname = "my-test-project";
		await seed({
			[`./${dirname}/package.json`]: "not valid json",
		});
		expect(getWorkerNameFromProject(`./${dirname}`)).toBe(dirname);
	});

	it("WRANGLER_CI_OVERRIDE_NAME should override the worker name", async ({
		expect,
	}) => {
		vi.stubEnv("WRANGLER_CI_OVERRIDE_NAME", "overridden-worker-name");

		await seed({
			"./my-project/package.json": JSON.stringify({ name: "original-name" }),
		});
		expect(getWorkerNameFromProject("./my-project")).toBe(
			"overridden-worker-name"
		);
	});
});
