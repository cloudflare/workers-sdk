import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { sendMetricsEvent } from "../../metrics";
import {
	AGENT_RATIONALE_CONTEXT_FLAG,
	categoriseForceRationale,
	FORCE_PAGES_FLAG,
	logPagesToWorkersForceOptOutNotice,
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

		expect(result).toEqual({ delegate: false });
		expect(sendMetricsEvent).not.toHaveBeenCalled();
	});

	it("does not delegate (or emit telemetry) when the deploy targets an existing Pages project", async ({
		expect,
	}) => {
		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			projectExists: true,
		});

		expect(result).toEqual({ delegate: false });
		// Skips are deterministic, expected non-cases, so they are not sent to
		// telemetry.
		expect(sendMetricsEvent).not.toHaveBeenCalled();
	});

	it("delegates a new project even when the account already has other Pages projects", async ({
		expect,
	}) => {
		// The gate is per-project, not per-account: `projectExists: false` means
		// this specific project is new, so we delegate regardless of what else the
		// account has.
		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			projectExists: false,
		});

		expect(result).toEqual({
			delegate: true,
			command: "deploy",
			agentId: "test-agent",
			deployArgs: {},
		});
	});

	it("does not delegate when project has a functions directory", async ({
		expect,
	}) => {
		createFunctionsDir(process.cwd());

		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({ delegate: false });
		expect(sendMetricsEvent).not.toHaveBeenCalled();
	});

	const unsupportedFileMarkers: [marker: string, reason: string][] = [
		["_worker.js", "advanced-mode _worker.js"],
		["_routes.json", "_routes.json file"],
	];

	for (const [marker] of unsupportedFileMarkers) {
		it(`does not delegate when project has a ${marker}`, async ({ expect }) => {
			createFile(process.cwd(), marker);

			const result = await maybeDelegatePagesToWorkers({
				command: "deploy",
				projectPath: process.cwd(),
			});

			expect(result).toEqual({ delegate: false });
			expect(sendMetricsEvent).not.toHaveBeenCalled();
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

		expect(result).toEqual({ delegate: false });
		expect(sendMetricsEvent).not.toHaveBeenCalled();
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
				delegate: true,
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
				delegate: true,
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

		expect(result).toEqual({ delegate: false });
		expect(sendMetricsEvent).not.toHaveBeenCalled();
	});

	it("delegates a brand-new static deploy to Workers", async ({ expect }) => {
		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
		});

		expect(result).toEqual({
			delegate: true,
			command: "deploy",
			agentId: "test-agent",
			deployArgs: {},
		});
		expect(std.out).toContain(
			"Delegating to the latest version of Cloudflare Pages, now part of Cloudflare Workers"
		);
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"delegate pages to workers",
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
			delegate: true,
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
			delegate: true,
			command: "deploy",
			agentId: "test-agent",
			deployArgs: { name: "my-app" },
		});
		if (!result.delegate) {
			throw new Error("Expected delegation to be actioned");
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
			delegate: true,
			command: "create",
			agentId: "test-agent",
			deployArgs: {
				name: "my-proj",
				compatibilityDate: "2024-01-01",
				compatibilityFlags: ["nodejs_compat"],
			},
		});
	});

	it("does not delegate when the opt-out flag is set, records the opt-out (with an unspecified rationale), and flags forcedOptOut", async ({
		expect,
	}) => {
		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			force: true,
		});

		expect(result).toEqual({ delegate: false, forcedOptOut: true });
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"delegate pages to workers",
			expect.objectContaining({
				command: "deploy",
				result: "forced",
				// No rationale was passed, so it is recorded as "unspecified".
				rationale: "unspecified",
			}),
			expect.anything()
		);
	});

	it("records a recognised rationale category on the forced event", async ({
		expect,
	}) => {
		const result = await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			force: true,
			rationale: "user-requested-pages",
		});

		expect(result).toEqual({ delegate: false, forcedOptOut: true });
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"delegate pages to workers",
			expect.objectContaining({
				result: "forced",
				rationale: "user-requested-pages",
			}),
			expect.anything()
		);
	});

	it("buckets an unrecognised rationale as 'other' rather than transmitting the raw text", async ({
		expect,
	}) => {
		await maybeDelegatePagesToWorkers({
			command: "deploy",
			projectPath: process.cwd(),
			force: true,
			// A value that could contain sensitive text must never be sent verbatim.
			rationale: "token=sk-secret-value",
		});

		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"delegate pages to workers",
			expect.objectContaining({ result: "forced", rationale: "other" }),
			expect.anything()
		);
		const [, properties] = vi.mocked(sendMetricsEvent).mock.calls[0];
		expect(JSON.stringify(properties)).not.toContain("sk-secret-value");
	});

	it("emits a one-time, deploy-specific opt-out notice to stdout", ({
		expect,
	}) => {
		logPagesToWorkersForceOptOutNotice("deploy");

		expect(std.out).toContain("deployed directly on Cloudflare Pages");
		expect(std.out).toContain(
			`This is the only time you need --${FORCE_PAGES_FLAG}`
		);
		expect(std.out).toContain("this project now exists");
		expect(std.out).toContain(
			`Do not pass --${FORCE_PAGES_FLAG} on future commands`
		);
	});

	it("emits a one-time, create-specific opt-out notice to stdout", ({
		expect,
	}) => {
		logPagesToWorkersForceOptOutNotice("create");

		expect(std.out).toContain("created directly on Cloudflare Pages");
		expect(std.out).toContain(
			`This is the only time you need --${FORCE_PAGES_FLAG}`
		);
	});

	it("records failure and gives explicit, loop-safe opt-out guidance", async ({
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
		expect(std.warn).toContain(`wrangler pages deploy --${FORCE_PAGES_FLAG}`);
		// The failure message hands the agent the exact rationale for this case,
		// so a subsequent opt-out is attributable rather than "unspecified".
		expect(std.warn).toContain(
			`--${AGENT_RATIONALE_CONTEXT_FLAG}=workers-delegation-failed`
		);
		expect(sendMetricsEvent).toHaveBeenCalledWith(
			"delegate pages to workers",
			expect.objectContaining({ command: "deploy", result: "failure" }),
			expect.anything()
		);
	});

	it("gives create-specific opt-out guidance when a create delegation fails", async ({
		expect,
	}) => {
		recordPagesToWorkersDelegateFailure(
			"create",
			{ name: "my-proj" },
			"test-agent",
			new Error("nope")
		);

		expect(std.warn).toContain(
			`wrangler pages project create --${FORCE_PAGES_FLAG}`
		);
	});
});

describe("categoriseForceRationale", () => {
	it("returns 'unspecified' when no rationale is given", ({ expect }) => {
		expect(categoriseForceRationale(undefined)).toBe("unspecified");
	});

	it("keeps a recognised category", ({ expect }) => {
		expect(categoriseForceRationale("existing-pages-workflow")).toBe(
			"existing-pages-workflow"
		);
	});

	it("normalises case and surrounding whitespace before matching", ({
		expect,
	}) => {
		expect(categoriseForceRationale("  User-Requested-Pages  ")).toBe(
			"user-requested-pages"
		);
	});

	it("collapses anything off-menu to 'other'", ({ expect }) => {
		expect(categoriseForceRationale("because the user said so")).toBe("other");
		expect(categoriseForceRationale("")).toBe("other");
	});
});
