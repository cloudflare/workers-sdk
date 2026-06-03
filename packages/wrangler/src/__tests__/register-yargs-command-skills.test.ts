import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, test, vi } from "vitest";
import { maybeInstallCloudflareSkillsGlobally } from "../agents-skills-install";
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
		// Seed a wrangler config so `wrangler setup` skips autoconfig and
		// returns quickly — we only care about the skills install call.
		await seed({
			"wrangler.jsonc": JSON.stringify({ name: "test-worker" }),
		});
	});

	test("calls maybeInstallCloudflareSkillsGlobally with false by default", async ({
		expect,
	}) => {
		await runWrangler("setup");

		expect(maybeInstallCloudflareSkillsGlobally).toHaveBeenCalledWith(false);
	});

	test("calls maybeInstallCloudflareSkillsGlobally with true when --install-skills is passed", async ({
		expect,
	}) => {
		await runWrangler("setup --install-skills");

		expect(maybeInstallCloudflareSkillsGlobally).toHaveBeenCalledWith(true);
	});

	test("does not call maybeInstallCloudflareSkillsGlobally for `wrangler complete`", async ({
		expect,
	}) => {
		// `wrangler complete zsh` output is captured by `eval "$(wrangler complete zsh)"`.
		// The interactive skills prompt must not appear in that output.
		await runWrangler("complete zsh");

		expect(maybeInstallCloudflareSkillsGlobally).not.toHaveBeenCalled();
	});

	test("still calls maybeInstallCloudflareSkillsGlobally when --install-skills is explicit on `wrangler complete`", async ({
		expect,
	}) => {
		// Explicit --install-skills should be honored even for `complete`.
		await runWrangler("complete zsh --install-skills");

		expect(maybeInstallCloudflareSkillsGlobally).toHaveBeenCalledWith(true);
	});
});
