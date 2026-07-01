import * as fs from "node:fs";
import { getInstalledPackageVersion } from "@cloudflare/autoconfig";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { clearOutputFilePath } from "../../output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs, mockConfirm, mockPrompt } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { mockGetSettings } from "../helpers/mock-worker-settings";
import { createFetchResult, msw } from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWorkerSource } from "../helpers/write-worker-source";
import {
	mockDeploymentsListRequest,
	mockLastDeploymentRequest,
	mockPatchScriptSettings,
} from "./helpers";

vi.mock("command-exists");
vi.mock("../../check/commands", async (importOriginal) => {
	return {
		...(await importOriginal()),
		analyseBundle() {
			return `{}`;
		},
	};
});

vi.mock("../../package-manager", async (importOriginal) => ({
	...(await importOriginal()),
	sniffUserAgent: () => "npm",
	getPackageManager() {
		return {
			type: "npm",
			npx: "npx",
		};
	},
}));

vi.mock("@cloudflare/autoconfig", async (importOriginal) => ({
	...(await importOriginal()),
	runAutoConfig: vi.fn(),
	getInstalledPackageVersion: vi.fn(),
}));
vi.mock("@cloudflare/cli-shared-helpers/command");

describe("deploy: interactive deploy config prompts", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.stubGlobal("setTimeout", (fn: () => void) => {
			setImmediate(fn);
		});
		setIsTTY(true);
		mockLastDeploymentRequest();
		mockDeploymentsListRequest();
		mockPatchScriptSettings();
		mockGetSettings();
		msw.use(...mswListNewDeploymentsLatestFull);
		msw.use(
			http.get("*/accounts/:accountId/r2/buckets/:bucketName", async () => {
				return HttpResponse.json(createFetchResult({}));
			})
		);
		vi.mocked(getInstalledPackageVersion).mockReturnValue(undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearDialogs();
		clearOutputFilePath();
	});

	it("should prompt and use today's date when user confirms", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		writeWranglerConfig(
			{ compatibility_date: undefined as unknown as string },
			"./wrangler.toml"
		);
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});

		await runWrangler("deploy ./index.js --name test-name --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
	});

	it("should error when user declines the compatibility date prompt", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		writeWranglerConfig(
			{ compatibility_date: undefined as unknown as string },
			"./wrangler.toml"
		);
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: false,
		});

		await expect(
			runWrangler("deploy ./index.js --name test-name --dry-run")
		).rejects.toThrow("A compatibility_date is required when publishing");
	});

	it("should error in non-interactive mode when no compatibility_date is provided", async ({
		expect,
	}) => {
		setIsTTY(false);
		writeWorkerSource();
		writeWranglerConfig(
			{ compatibility_date: undefined as unknown as string },
			"./wrangler.toml"
		);

		await expect(
			runWrangler("deploy ./index.js --name test-name")
		).rejects.toThrow("A compatibility_date is required");
	});

	it("should not show config-write prompt when config file already exists", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		writeWranglerConfig(
			{ compatibility_date: undefined as unknown as string },
			"./wrangler.toml"
		);
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});

		await runWrangler("deploy ./index.js --name test-name --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		// Should NOT be asked to write a config file since one already exists
		expect(std.out).not.toContain(
			"Do you want Wrangler to write a wrangler.json config file"
		);
		expect(std.out).not.toContain("Proceeding with deployment...");
	});

	it("should skip the compat date prompt when --latest is passed", async ({
		expect,
	}) => {
		setIsTTY(true);
		writeWorkerSource();
		writeWranglerConfig(
			{ compatibility_date: undefined as unknown as string },
			"./wrangler.toml"
		);

		await runWrangler("deploy ./index.js --name test-name --latest --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		// No compat date prompt should have been shown
		expect(std.out).not.toContain("No compatibility date is set");
	});

	it("should prompt for name, compat date, and offer to write config when no config file exists", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		// No writeWranglerConfig call — no config file exists
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler("deploy ./index.js --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		// Config file should be written with main but without an assets key
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
		});
		expect(writtenConfig).not.toHaveProperty("assets");
		expect(std.out).toContain(
			"Simply run `wrangler deploy` next time. Wrangler will automatically use the configuration saved to wrangler.jsonc."
		);
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should show suggested CLI flags when user declines config file write", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		// No writeWranglerConfig call — no config file exists
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: false,
		});

		await runWrangler("deploy ./index.js --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		expect(fs.existsSync("wrangler.jsonc")).toBe(false);
		expect(std.out).toContain(
			"wrangler deploy ./index.js --name test-worker --compatibility-date 2024-06-15"
		);
		// Should not include --assets since no assets were used
		expect(std.out).not.toContain("--assets");
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should write config with today's compat date when --latest is used and no config file exists", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		// No writeWranglerConfig call — no config file exists
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		// No compat date prompt — --latest skips it
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler("deploy ./index.js --latest --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		// Config file should include today's date even though --latest was used
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
		});
		expect(std.out).not.toContain("No compatibility date is set");
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include compat date in suggested CLI command when --latest is used and config write declined", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		// No writeWranglerConfig call — no config file exists
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		// No compat date prompt — --latest skips it
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: false,
		});

		await runWrangler("deploy ./index.js --latest --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		expect(fs.existsSync("wrangler.jsonc")).toBe(false);
		// Suggested command should include the resolved compat date
		expect(std.out).toContain(
			"wrangler deploy ./index.js --name test-worker --compatibility-date 2024-06-15"
		);
		expect(std.out).not.toContain("No compatibility date is set");
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should prompt for name when config file exists but has no name", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		writeWranglerConfig({ name: undefined as unknown as string });
		mockPrompt({
			text: "What do you want to name your project?",
			result: "prompted-name",
		});

		await runWrangler("deploy ./index.js --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		// Should NOT be asked to write a config file since one already exists
		expect(std.out).not.toContain(
			"Do you want Wrangler to write a wrangler.json config file"
		);
		expect(std.out).not.toContain("Proceeding with deployment...");
	});

	it("should not prompt for name when config file provides one", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		writeWranglerConfig({
			name: "config-provided-name",
			compatibility_date: undefined as unknown as string,
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});

		await runWrangler("deploy ./index.js --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		// Should NOT have been asked for a name
		expect(std.out).not.toContain("What do you want to name your project?");
	});

	it("should include compatibility_flags in generated wrangler.jsonc when --compatibility-flags is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		// No writeWranglerConfig call — no config file exists
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler(
			"deploy ./index.js --compatibility-flags=nodejs_compat --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			compatibility_flags: ["nodejs_compat"],
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include --compatibility-flags in suggested CLI command when user declines config file write", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		// No writeWranglerConfig call — no config file exists
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: false,
		});

		await runWrangler(
			"deploy ./index.js --compatibility-flags=nodejs_compat --compatibility-flags=disable_navigator_language --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		expect(fs.existsSync("wrangler.jsonc")).toBe(false);
		// Suggested command should include the compat flags
		expect(std.out).toContain(
			"wrangler deploy ./index.js --name test-worker --compatibility-date 2024-06-15 --compatibility-flags nodejs_compat disable_navigator_language"
		);
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include multiple --compatibility-flags in suggested CLI command and config file", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		// No writeWranglerConfig call — no config file exists
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler(
			"deploy ./index.js --compatibility-flags=nodejs_compat --compatibility-flags=url_standard --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			compatibility_flags: ["nodejs_compat", "url_standard"],
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include routes in generated wrangler.jsonc when --routes is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler(
			"deploy ./index.js --routes example.com/* --routes other.com/path --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			routes: ["example.com/*", "other.com/path"],
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include --routes in suggested CLI command when user declines config file write", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: false,
		});

		await runWrangler(
			"deploy ./index.js --routes example.com/* --routes other.com/path --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		expect(fs.existsSync("wrangler.jsonc")).toBe(false);
		expect(std.out).toContain("--routes example.com/* other.com/path");
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include domains as custom_domain routes in generated wrangler.jsonc when --domains is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler(
			"deploy ./index.js --domains api.example.com --domains app.example.com --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			routes: [
				{ pattern: "api.example.com", custom_domain: true },
				{ pattern: "app.example.com", custom_domain: true },
			],
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include --domains in suggested CLI command when user declines config file write", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: false,
		});

		await runWrangler(
			"deploy ./index.js --domains api.example.com --domains app.example.com --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		expect(fs.existsSync("wrangler.jsonc")).toBe(false);
		expect(std.out).toContain("--domains api.example.com app.example.com");
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should merge --routes and --domains into routes array in generated wrangler.jsonc", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler(
			"deploy ./index.js --routes example.com/* --domains api.example.com --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			routes: [
				"example.com/*",
				{ pattern: "api.example.com", custom_domain: true },
			],
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include triggers in generated wrangler.jsonc when --triggers is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler("deploy ./index.js --triggers '*/5 * * * *' --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			triggers: { crons: ["*/5 * * * *"] },
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include --triggers in suggested CLI command when user declines config file write", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: false,
		});

		await runWrangler("deploy ./index.js --triggers '*/5 * * * *' --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		expect(fs.existsSync("wrangler.jsonc")).toBe(false);
		expect(std.out).toContain("--triggers '*/5 * * * *'");
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include vars in generated wrangler.jsonc when --var is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler(
			"deploy ./index.js --var MY_VAR:my-value --var OTHER:thing --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			vars: { MY_VAR: "my-value", OTHER: "thing" },
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include --var in suggested CLI command when user declines config file write", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: false,
		});

		await runWrangler(
			"deploy ./index.js --var MY_VAR:my-value --var OTHER:thing --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		expect(fs.existsSync("wrangler.jsonc")).toBe(false);
		expect(std.out).toContain("--var MY_VAR:my-value OTHER:thing");
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include define in generated wrangler.jsonc when --define is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler("deploy ./index.js --define MY_CONST:true --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			define: { MY_CONST: "true" },
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include --define in suggested CLI command when user declines config file write", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: false,
		});

		await runWrangler("deploy ./index.js --define MY_CONST:true --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		expect(fs.existsSync("wrangler.jsonc")).toBe(false);
		expect(std.out).toContain("--define MY_CONST:true");
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include alias in generated wrangler.jsonc when --alias is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler(
			"deploy ./index.js --alias some-module:./aliased.js --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			alias: { "some-module": "./aliased.js" },
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include jsx_factory in generated wrangler.jsonc when --jsx-factory is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler("deploy ./index.js --jsx-factory h --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			jsx_factory: "h",
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include jsx_fragment in generated wrangler.jsonc when --jsx-fragment is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler("deploy ./index.js --jsx-fragment Fragment --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			jsx_fragment: "Fragment",
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include tsconfig in generated wrangler.jsonc when --tsconfig is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		fs.writeFileSync("tsconfig.custom.json", JSON.stringify({}));
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler(
			"deploy ./index.js --tsconfig ./tsconfig.custom.json --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			tsconfig: "./tsconfig.custom.json",
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include minify in generated wrangler.jsonc when --minify is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler("deploy ./index.js --minify --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			minify: true,
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include --minify in suggested CLI command when user declines config file write", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: false,
		});

		await runWrangler("deploy ./index.js --minify --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		expect(fs.existsSync("wrangler.jsonc")).toBe(false);
		expect(std.out).toContain("--minify");
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include upload_source_maps in generated wrangler.jsonc when --upload-source-maps is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler("deploy ./index.js --upload-source-maps --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			upload_source_maps: true,
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include no_bundle in generated wrangler.jsonc when --no-bundle is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler("deploy ./index.js --no-bundle --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			no_bundle: true,
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include logpush in generated wrangler.jsonc when --logpush is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler("deploy ./index.js --logpush --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			logpush: true,
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include keep_vars in generated wrangler.jsonc when --keep-vars is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler("deploy ./index.js --keep-vars --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			keep_vars: true,
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include --keep-vars in suggested CLI command when user declines config file write", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: false,
		});

		await runWrangler("deploy ./index.js --keep-vars --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		expect(fs.existsSync("wrangler.jsonc")).toBe(false);
		expect(std.out).toContain("--keep-vars");
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include legacy_env in generated wrangler.jsonc when --legacy-env is passed", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler("deploy ./index.js --legacy-env --dry-run");
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			legacy_env: true,
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include --dispatch-namespace in suggested CLI command when user declines config file write", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: false,
		});

		await runWrangler(
			"deploy ./index.js --dispatch-namespace my-namespace --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		expect(fs.existsSync("wrangler.jsonc")).toBe(false);
		expect(std.out).toContain("--dispatch-namespace my-namespace");
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include multiple flags in generated wrangler.jsonc and suggested CLI command", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: true,
		});

		await runWrangler(
			"deploy ./index.js --routes example.com/* --var MY_VAR:hello --minify --logpush --compatibility-flags=nodejs_compat --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		const writtenConfig = JSON.parse(
			fs.readFileSync("wrangler.jsonc", "utf-8")
		);
		expect(writtenConfig).toEqual({
			name: "test-worker",
			compatibility_date: "2024-06-15",
			main: "./index.js",
			compatibility_flags: ["nodejs_compat"],
			routes: ["example.com/*"],
			vars: { MY_VAR: "hello" },
			minify: true,
			logpush: true,
		});
		expect(std.out).toContain("Proceeding with deployment...");
	});

	it("should include multiple flags in suggested CLI command when user declines config file write", async ({
		expect,
	}) => {
		vi.setSystemTime(new Date(2024, 5, 15));
		setIsTTY(true);
		writeWorkerSource();
		mockPrompt({
			text: "What do you want to name your project?",
			result: "test-worker",
		});
		mockConfirm({
			text: "No compatibility date is set. Would you like to use today's date (2024-06-15)?",
			result: true,
		});
		mockConfirm({
			text: "Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\nThis will allow you to simply run `wrangler deploy` on future deployments.",
			result: false,
		});

		await runWrangler(
			"deploy ./index.js --routes example.com/* --var MY_VAR:hello --minify --logpush --upload-source-maps --dispatch-namespace my-ns --dry-run"
		);
		expect(std.out).toContain("--dry-run: exiting now.");
		expect(fs.existsSync("wrangler.jsonc")).toBe(false);
		expect(std.out).toContain("--routes example.com/*");
		expect(std.out).toContain("--var MY_VAR:hello");
		expect(std.out).toContain("--minify");
		expect(std.out).toContain("--logpush");
		expect(std.out).toContain("--upload-source-maps");
		expect(std.out).toContain("--dispatch-namespace my-ns");
		expect(std.out).toContain("Proceeding with deployment...");
	});
});
