import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { main } from "../../index";
import { sendMetricsEvent } from "../../metrics";
import { maybeRedirectPagesToWorkers } from "../../pages/redirect-to-workers";
import { getDetectedAgentId, isAgenticAgent } from "../../utils/detect-agent";
import { mockConsoleMethods } from "../helpers/mock-console";

vi.mock("../../utils/detect-agent");
vi.mock("../../index", () => ({ main: vi.fn() }));
vi.mock("../../metrics");

/** Create a `functions/` directory marker inside `dir`. */
function createFunctionsDir(dir: string): void {
	mkdirSync(join(dir, "functions"));
}

/** Create a `_worker.js` file marker inside `dir`. */
function createWorkerFile(dir: string): void {
	writeFileSync(join(dir, "_worker.js"), "");
}

describe("maybeRedirectPagesToWorkers", () => {
	const std = mockConsoleMethods();

	runInTempDir();

	beforeEach(() => {
		vi.mocked(isAgenticAgent).mockReturnValue(true);
		vi.mocked(getDetectedAgentId).mockReturnValue("test-agent");
		vi.mocked(main).mockResolvedValue(undefined);
	});

	it("does not redirect when not run by an agent", async ({ expect }) => {
		vi.mocked(isAgenticAgent).mockReturnValue(false);

		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({ handled: false });
		expect(main).not.toHaveBeenCalled();
	});

	it("does not redirect an existing Pages project on deploy", async ({
		expect,
	}) => {
		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			existingProject: true,
		});

		expect(result).toEqual({ handled: false });
		expect(main).not.toHaveBeenCalled();
	});

	it("does not redirect when project has a functions directory", async ({
		expect,
	}) => {
		createFunctionsDir(process.cwd());

		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({ handled: false });
		expect(main).not.toHaveBeenCalled();
	});

	it("does not redirect when project has a _worker.js file", async ({
		expect,
	}) => {
		createWorkerFile(process.cwd());

		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({ handled: false });
		expect(main).not.toHaveBeenCalled();
	});

	it("does not redirect when the assets directory has dynamic markers", async ({
		expect,
	}) => {
		const assetsDirectory = join(process.cwd(), "dist");
		mkdirSync(assetsDirectory);
		createWorkerFile(assetsDirectory);

		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			assetsDirectory,
		});

		expect(result).toEqual({ handled: false });
		expect(main).not.toHaveBeenCalled();
	});

	it("redirects a brand-new static deploy to Workers", async ({ expect }) => {
		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({ handled: true });
		expect(main).toHaveBeenCalledWith(["deploy"]);
		expect(std.warn).toContain("deployed to Cloudflare Workers");
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages redirect to workers",
			expect.objectContaining({ command: "deploy", result: "success" }),
			expect.anything()
		);
	});

	it("falls back to Pages when the Workers deploy fails", async ({
		expect,
	}) => {
		vi.mocked(main).mockRejectedValue(new Error("boom"));

		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({ handled: false });
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages redirect to workers",
			expect.objectContaining({ result: "fallback" }),
			expect.anything()
		);
	});

	it("redirects a new static project on create", async ({ expect }) => {
		const result = await maybeRedirectPagesToWorkers({
			command: "create",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({ handled: true });
		expect(main).toHaveBeenCalledWith(["deploy"]);
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages redirect to workers",
			expect.objectContaining({ command: "create", result: "success" }),
			expect.anything()
		);
	});
});
