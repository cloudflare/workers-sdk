import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { sendMetricsEvent } from "../../metrics";
import {
	maybeDelegatePagesToWorkers,
	recordPagesToWorkersDelegateFailure,
} from "../../pages/delegate-to-workers";
import { detectAgent } from "../../utils/detect-agent";
import { mockConsoleMethods } from "../helpers/mock-console";

vi.mock("../../utils/detect-agent");
vi.mock("../../metrics");

/** Create a `functions/` directory marker inside `dir`. */
function createFunctionsDir(dir: string): void {
	mkdirSync(join(dir, "functions"));
}

/** Create a named (empty) file marker inside `dir`. */
function createFile(dir: string, name: string): void {
	writeFileSync(join(dir, name), "");
}

describe("maybeDelegatePagesToWorkers", () => {
	const std = mockConsoleMethods();

	runInTempDir();

	beforeEach(() => {
		vi.mocked(detectAgent).mockReturnValue({ isAgent: true, id: "test-agent" });
	});

	it("does not delegate (or emit telemetry) when not run by an agent", async ({
		expect,
	}) => {
		vi.mocked(detectAgent).mockReturnValue({ isAgent: false, id: null });

		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({ handled: false });
		expect(sendMetricsEvent).not.toHaveBeenCalled();
	});

	for (const command of ["deploy", "create"] as const) {
		it(`does not delegate when the account already has Pages projects (${command}), and records why`, async ({
			expect,
		}) => {
			const result = await maybeDelegatePagesToWorkers({
				command,
				projectPath: process.cwd(),
				accountHasPagesProjects: async () => true,
			});

			expect(result).toEqual({ handled: false });
			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"pages delegate to workers",
				expect.objectContaining({
					result: "skipped",
					reason: "account has pages projects",
				}),
				expect.anything()
			);
		});
	}

	it("delegates when the account has no Pages projects", async ({ expect }) => {
		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			accountHasPagesProjects: async () => false,
		});

		expect(result).toEqual({
			handled: true,
			command: "deploy",
			agentId: "test-agent",
			deployArgs: {},
		});
	});

	it("skips delegation (and records why) when the account Pages projects lookup fails", async ({
		expect,
	}) => {
		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			accountHasPagesProjects: async () => {
				throw new Error("boom");
			},
		});

		expect(result).toEqual({ handled: false });
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages delegate to workers",
			expect.objectContaining({
				result: "skipped",
				reason: "account pages projects lookup failed",
			}),
			expect.anything()
		);
	});

	it("does not query account Pages projects when a cheaper, local check already skips", async ({
		expect,
	}) => {
		createFunctionsDir(process.cwd());
		const accountHasPagesProjects = vi.fn(async () => true);

		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			accountHasPagesProjects,
		});

		expect(result).toEqual({ handled: false });
		// The functions/ directory is a local, no-cost skip reason, so the
		// account-listing API call must never be made.
		expect(accountHasPagesProjects).not.toHaveBeenCalled();
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages delegate to workers",
			expect.objectContaining({
				result: "skipped",
				reason: "pages functions directory",
			}),
			expect.anything()
		);
	});

	it("does not delegate when project has a functions directory", async ({
		expect,
	}) => {
		createFunctionsDir(process.cwd());

		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({ handled: false });
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages delegate to workers",
			expect.objectContaining({
				result: "skipped",
				reason: "pages functions directory",
			}),
			expect.anything()
		);
	});

	const unsupportedFileMarkers: [marker: string, reason: string][] = [
		["_worker.js", "advanced-mode _worker.js"],
		["_routes.json", "_routes.json file"],
	];

	for (const [marker, reason] of unsupportedFileMarkers) {
		it(`does not delegate when project has a ${marker}, and records why`, async ({
			expect,
		}) => {
			createFile(process.cwd(), marker);

			const result = await maybeDelegatePagesToWorkers({
				command: "deploy",
				projectPath: process.cwd(),
			});

			expect(result).toEqual({ handled: false });
			expect(sendMetricsEvent).toHaveBeenCalledWith(
				"pages delegate to workers",
				expect.objectContaining({ result: "skipped", reason }),
				expect.anything()
			);
		});
	}

	it("does not delegate when the assets directory has unsupported markers", async ({
		expect,
	}) => {
		const assetsDirectory = join(process.cwd(), "dist");
		mkdirSync(assetsDirectory);
		createFile(assetsDirectory, "_routes.json");

		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			assetsDirectory,
		});

		expect(result).toEqual({ handled: false });
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages delegate to workers",
			expect.objectContaining({
				result: "skipped",
				reason: "_routes.json file",
			}),
			expect.anything()
		);
	});

	for (const marker of ["_redirects", "_headers"]) {
		it(`delegates when project has a supported ${marker} file`, async ({
			expect,
		}) => {
			createFile(process.cwd(), marker);

			const result = await maybeDelegatePagesToWorkers({
				command: "deploy",
				projectPath: process.cwd(),
			});

			expect(result).toEqual({
				handled: true,
				command: "deploy",
				agentId: "test-agent",
				deployArgs: {},
			});
		});

		it(`delegates when the assets directory has a supported ${marker} file`, async ({
			expect,
		}) => {
			const assetsDirectory = join(process.cwd(), "dist");
			mkdirSync(assetsDirectory);
			createFile(assetsDirectory, marker);

			const result = await maybeDelegatePagesToWorkers({
				command: "deploy",
				projectPath: process.cwd(),
				assetsDirectory,
			});

			expect(result).toEqual({
				handled: true,
				command: "deploy",
				agentId: "test-agent",
				deployArgs: {},
			});
		});
	}

	it("does not delegate when Pages-only args are present", async ({
		expect,
	}) => {
		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			unsupportedArgs: ["--branch"],
		});

		expect(result).toEqual({ handled: false });
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages delegate to workers",
			expect.objectContaining({
				result: "skipped",
				reason: "unsupported args: --branch",
			}),
			expect.anything()
		);
	});

	it("delegates a brand-new static deploy to Workers", async ({ expect }) => {
		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({
			handled: true,
			command: "deploy",
			agentId: "test-agent",
			deployArgs: {},
		});
		expect(std.out).toContain(
			"Delegating to the latest version of Cloudflare Pages, now part of Cloudflare Workers"
		);
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages delegate to workers",
			expect.objectContaining({ command: "deploy", result: "delegated" }),
			expect.anything()
		);
	});

	it("carries the project name across to the Workers deploy", async ({
		expect,
	}) => {
		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			projectName: "my-app",
		});

		expect(result).toEqual({
			handled: true,
			command: "deploy",
			agentId: "test-agent",
			deployArgs: { name: "my-app" },
		});
	});

	it("does not forward --assets, so autoconfig stays enabled to configure the deploy", async ({
		expect,
	}) => {
		const assetsDirectory = join(process.cwd(), "dist");
		mkdirSync(assetsDirectory);

		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			assetsDirectory,
			projectName: "my-app",
		});

		expect(result).toEqual({
			handled: true,
			command: "deploy",
			agentId: "test-agent",
			deployArgs: { name: "my-app" },
		});
		if (!result.handled) {
			throw new Error("Expected delegation to be handled");
		}
		// Regression guard: forwarding `--assets` would disable autoconfig, and a
		// non-interactive agent deploy would then have no compatibility date and
		// fail validation. autoconfig must run to detect the directory and write a
		// Workers config, so the assets directory must never reach the deploy argv.
		expect(result.deployArgs).not.toHaveProperty("assets");
		expect(result.deployArgs).not.toHaveProperty("path");
	});

	it("carries name and compatibility settings across on create", async ({
		expect,
	}) => {
		const result = await maybeDelegatePagesToWorkers({
			command: "create",
			projectPath: process.cwd(),
			projectName: "my-proj",
			compatibilityDate: "2024-01-01",
			compatibilityFlags: ["nodejs_compat"],
		});

		expect(result).toEqual({
			handled: true,
			command: "create",
			agentId: "test-agent",
			deployArgs: {
				name: "my-proj",
				compatibilityDate: "2024-01-01",
				compatibilityFlags: ["nodejs_compat"],
			},
		});
	});

	it("does not delegate when --force is set, and records the opt-out", async ({
		expect,
	}) => {
		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			force: true,
		});

		expect(result).toEqual({ handled: false });
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages delegate to workers",
			expect.objectContaining({ command: "deploy", result: "forced" }),
			expect.anything()
		);
	});

	it("records failure and gives explicit, loop-safe --force guidance", async ({
		expect,
	}) => {
		recordPagesToWorkersDelegateFailure(
			"deploy",
			{},
			"test-agent",
			new Error("boom")
		);

		expect(std.warn).toContain("nothing was deployed");
		expect(std.warn).toContain("do not retry it unchanged");
		expect(std.warn).toContain("wrangler pages deploy --force");
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"pages delegate to workers",
			expect.objectContaining({ command: "deploy", result: "failure" }),
			expect.anything()
		);
	});

	it("gives create-specific --force guidance when a create delegation fails", async ({
		expect,
	}) => {
		recordPagesToWorkersDelegateFailure(
			"create",
			{ name: "my-proj" },
			"test-agent",
			new Error("nope")
		);

		expect(std.warn).toContain("wrangler pages project create --force");
	});
});
