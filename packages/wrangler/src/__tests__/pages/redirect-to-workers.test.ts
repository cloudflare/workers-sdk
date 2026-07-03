import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { main } from "../../index";
import { sendMetricsEvent } from "../../metrics";
import { maybeRedirectPagesToWorkers } from "../../pages/redirect-to-workers";
import { detectAgent } from "../../utils/detect-agent";
import { mockConsoleMethods } from "../helpers/mock-console";

vi.mock("../../utils/detect-agent");
vi.mock("../../index", () => ({ main: vi.fn() }));
vi.mock("../../metrics");

/** Create a `functions/` directory marker inside `dir`. */
function createFunctionsDir(dir: string): void {
	mkdirSync(join(dir, "functions"));
}

/** Create a named (empty) file marker inside `dir`. */
function createFile(dir: string, name: string): void {
	writeFileSync(join(dir, name), "");
}

describe("maybeRedirectPagesToWorkers", () => {
	const std = mockConsoleMethods();

	runInTempDir();

	beforeEach(() => {
		vi.mocked(detectAgent).mockReturnValue({ isAgent: true, id: "test-agent" });
		vi.mocked(main).mockResolvedValue(undefined);
	});

	it("does not redirect (or emit telemetry) when not run by an agent", async ({
		expect,
	}) => {
		vi.mocked(detectAgent).mockReturnValue({ isAgent: false, id: null });

		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({ handled: false });
		expect(main).not.toHaveBeenCalled();
		expect(sendMetricsEvent).not.toHaveBeenCalled();
	});

	it("does not redirect an existing Pages project on deploy, and records why", async ({
		expect,
	}) => {
		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			existingProject: true,
		});

		expect(result).toEqual({ handled: false });
		expect(main).not.toHaveBeenCalled();
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages redirect to workers",
			expect.objectContaining({
				result: "skipped",
				reason: "existing pages project",
			}),
			expect.anything()
		);
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
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages redirect to workers",
			expect.objectContaining({
				result: "skipped",
				reason: "pages functions directory",
			}),
			expect.anything()
		);
	});

	const unsupportedFileMarkers: [marker: string, reason: string][] = [
		["_worker.js", "advanced-mode _worker.js"],
		["_redirects", "_redirects file"],
		["_headers", "_headers file"],
		["_routes.json", "_routes.json file"],
	];

	for (const [marker, reason] of unsupportedFileMarkers) {
		it(`does not redirect when project has a ${marker}, and records why`, async ({
			expect,
		}) => {
			createFile(process.cwd(), marker);

			const result = await maybeRedirectPagesToWorkers({
				command: "deploy",
				projectPath: process.cwd(),
			});

			expect(result).toEqual({ handled: false });
			expect(main).not.toHaveBeenCalled();
			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"pages redirect to workers",
				expect.objectContaining({ result: "skipped", reason }),
				expect.anything()
			);
		});
	}

	it("does not redirect when the assets directory has unsupported markers", async ({
		expect,
	}) => {
		const assetsDirectory = join(process.cwd(), "dist");
		mkdirSync(assetsDirectory);
		createFile(assetsDirectory, "_routes.json");

		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			assetsDirectory,
		});

		expect(result).toEqual({ handled: false });
		expect(main).not.toHaveBeenCalled();
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages redirect to workers",
			expect.objectContaining({
				result: "skipped",
				reason: "_routes.json file",
			}),
			expect.anything()
		);
	});

	it("redirects a brand-new static deploy to Workers", async ({ expect }) => {
		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({ handled: true });
		expect(main).toHaveBeenCalledWith(["deploy"]);
		expect(std.out).toContain(
			"Redirecting to the latest version of Cloudflare Pages, now part of Cloudflare Workers"
		);
		expect(std.warn).toContain(
			"live on the latest version of Cloudflare Pages, now part of Cloudflare Workers"
		);
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages redirect to workers",
			expect.objectContaining({ command: "deploy", result: "redirected" }),
			expect.anything()
		);
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages redirect to workers",
			expect.objectContaining({ command: "deploy", result: "success" }),
			expect.anything()
		);
	});

	it("carries the project name across to the Workers deploy", async ({
		expect,
	}) => {
		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			projectName: "my-app",
		});

		expect(result).toEqual({ handled: true });
		expect(main).toHaveBeenCalledWith(["deploy", "--name", "my-app"]);
	});

	it("forwards the exact assets directory the user asked to deploy", async ({
		expect,
	}) => {
		const assetsDirectory = join(process.cwd(), "dist");
		mkdirSync(assetsDirectory);

		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			assetsDirectory,
			projectName: "my-app",
		});

		expect(result).toEqual({ handled: true });
		expect(main).toHaveBeenCalledWith([
			"deploy",
			"--assets",
			assetsDirectory,
			"--name",
			"my-app",
		]);
	});

	it("carries name and compatibility settings across on create", async ({
		expect,
	}) => {
		const result = await maybeRedirectPagesToWorkers({
			command: "create",
			projectPath: process.cwd(),
			projectName: "my-proj",
			compatibilityDate: "2024-01-01",
			compatibilityFlags: ["nodejs_compat"],
		});

		expect(result).toEqual({ handled: true });
		expect(main).toHaveBeenCalledWith([
			"deploy",
			"--name",
			"my-proj",
			"--compatibility-date",
			"2024-01-01",
			"--compatibility-flag",
			"nodejs_compat",
		]);
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages redirect to workers",
			expect.objectContaining({ command: "create", result: "success" }),
			expect.anything()
		);
	});

	it("does not redirect when --force is set, and records the opt-out", async ({
		expect,
	}) => {
		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			force: true,
		});

		expect(result).toEqual({ handled: false });
		expect(main).not.toHaveBeenCalled();
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages redirect to workers",
			expect.objectContaining({ command: "deploy", result: "forced" }),
			expect.anything()
		);
	});

	it("re-throws and does not fall back to Pages when the Workers deploy fails", async ({
		expect,
	}) => {
		vi.mocked(main).mockRejectedValue(new Error("boom"));

		await expect(
			maybeRedirectPagesToWorkers({
				command: "deploy",
				projectPath: process.cwd(),
			})
		).rejects.toThrow("boom");

		expect(main).toHaveBeenCalledTimes(1);
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages redirect to workers",
			expect.objectContaining({ result: "failure" }),
			expect.anything()
		);
		expect(sendMetricsEvent).not.toHaveBeenCalledWith(
			"pages redirect to workers",
			expect.objectContaining({ result: "success" }),
			expect.anything()
		);
	});

	it("gives explicit, loop-safe --force guidance when a deploy redirect fails", async ({
		expect,
	}) => {
		vi.mocked(main).mockRejectedValue(new Error("boom"));

		await expect(
			maybeRedirectPagesToWorkers({
				command: "deploy",
				projectPath: process.cwd(),
			})
		).rejects.toThrow("boom");

		expect(std.warn).toContain("nothing was deployed");
		expect(std.warn).toContain("do not retry it unchanged");
		expect(std.warn).toContain("wrangler pages deploy --force");
	});

	it("re-throws a failed create redirect without falling back to create", async ({
		expect,
	}) => {
		vi.mocked(main).mockRejectedValue(new Error("nope"));

		await expect(
			maybeRedirectPagesToWorkers({
				command: "create",
				projectPath: process.cwd(),
				projectName: "my-proj",
			})
		).rejects.toThrow("nope");

		expect(main).toHaveBeenCalledTimes(1);
		expect(std.warn).toContain("wrangler pages project create --force");
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages redirect to workers",
			expect.objectContaining({ command: "create", result: "failure" }),
			expect.anything()
		);
	});

	it("does not re-enter (cannot loop) while a redirect is already running", async ({
		expect,
	}) => {
		let nested: { handled: boolean } | undefined;
		// Simulate the Workers deploy itself trying to trigger another redirect.
		vi.mocked(main).mockImplementation(async () => {
			nested = await maybeRedirectPagesToWorkers({
				command: "deploy",
				projectPath: process.cwd(),
			});
		});

		const result = await maybeRedirectPagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({ handled: true });
		// The nested call bailed via the re-entrancy guard rather than starting
		// another deploy, so `main` ran exactly once.
		expect(nested).toEqual({ handled: false });
		expect(main).toHaveBeenCalledTimes(1);
	});
});
