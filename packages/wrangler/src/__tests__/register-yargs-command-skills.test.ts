import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, test, vi } from "vitest";
import { runSkillsInstallFlow } from "../agents-skills-install";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runWrangler } from "./helpers/run-wrangler";

vi.mock("../package-manager", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		getPackageManager() {
			return {
				type: "npm",
				npx: "npx",
			};
		},
	};
});

describe("register-yargs-command skills integration", () => {
	runInTempDir();
	mockConsoleMethods();

	beforeEach(async () => {
		await seed({
			"wrangler.jsonc": JSON.stringify({ name: "test-worker" }),
		});
	});

	test("does not call runSkillsInstallFlow for commands without suggestSkillsAfterHandler", async ({
		expect,
	}) => {
		// `wrangler complete` intentionally does not suggest skills because
		// its stdout is captured by shell eval.
		await runWrangler("complete zsh");

		expect(runSkillsInstallFlow).not.toHaveBeenCalled();
	});

	test("calls runSkillsInstallFlow with force: true and command when --install-skills is passed", async ({
		expect,
	}) => {
		// Use `complete` to isolate the --install-skills call from
		// suggestSkillsAfterHandler (which complete does not have).
		await runWrangler("complete zsh --install-skills");

		expect(runSkillsInstallFlow).toHaveBeenCalledWith({
			force: true,
			command: "complete",
		});
	});

	test("calls runSkillsInstallFlow after commands with suggestSkillsAfterHandler: true", async ({
		expect,
	}) => {
		await runWrangler("setup");

		expect(runSkillsInstallFlow).toHaveBeenCalledWith({
			force: false,
			command: "setup",
			promptMessage: expect.any(Function),
		});
	});

	test("calls runSkillsInstallFlow after `wrangler whoami` (non-JSON)", async ({
		expect,
	}) => {
		// whoami in non-JSON mode completes successfully even without auth
		// (it just prints "You are not authenticated") — the suggest-skills
		// hook should still fire afterwards.
		await runWrangler("whoami");

		expect(runSkillsInstallFlow).toHaveBeenCalledWith({
			force: false,
			command: "whoami",
			promptMessage: expect.any(Function),
		});
	});

	test("command in skills install event contains only the command name, not positional args or flags", async ({
		expect,
	}) => {
		// `wrangler complete zsh --install-skills` has:
		//   - positional arg: "zsh"
		//   - flag: "--install-skills"
		// The `command` passed to runSkillsInstallFlow should be just the
		// static command name from the definition ("complete"), with no
		// positional arg values or flags leaked into it.
		await runWrangler("complete zsh --install-skills");

		const call = vi.mocked(runSkillsInstallFlow).mock.calls[0][0];
		expect(call.command).toBe("complete");
		expect(call.command).not.toContain("zsh");
		expect(call.command).not.toContain("install-skills");
	});

	test("does not call runSkillsInstallFlow after `wrangler whoami --json`", async ({
		expect,
	}) => {
		// whoami --json without auth throws (non-zero exit), so we catch it.
		// The suggestSkillsAfterHandler function returns false for --json,
		// but the handler also throws, so the hook wouldn't run either way.
		await expect(runWrangler("whoami --json")).rejects.toThrow();

		expect(runSkillsInstallFlow).not.toHaveBeenCalled();
	});

	test("does not fail the command when runSkillsInstallFlow throws", async ({
		expect,
	}) => {
		// If the post-handler skills suggestion fails (e.g. EACCES writing
		// the metadata file, or an I/O error from the confirm prompt), the
		// command itself should still succeed — the error is swallowed and
		// logged at debug level.
		vi.mocked(runSkillsInstallFlow).mockRejectedValueOnce(
			new Error("EACCES: permission denied")
		);

		// `setup` has suggestSkillsAfterHandler: true, so it triggers the flow.
		// This should resolve successfully despite the skills flow throwing.
		await runWrangler("setup");

		expect(runSkillsInstallFlow).toHaveBeenCalled();
	});
});
