import * as fs from "node:fs";
import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { clearOutputFilePath } from "../../output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { clearDialogs } from "../helpers/mock-dialogs";
import { useMockIsTTY } from "../helpers/mock-istty";
import { runWrangler } from "../helpers/run-wrangler";

vi.mock("../../autoconfig/run");

describe("deploy --dry-run (Email Routing addresses)", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		setIsTTY(true);
	});

	afterEach(() => {
		clearDialogs();
		clearOutputFilePath();
	});

	it("accepts valid addresses on dry-run and exits without uploading", async ({
		expect,
	}) => {
		writeWranglerConfig({
			addresses: ["support@example.com", "*@example.com"],
		});
		fs.writeFileSync("index.js", "export default {};");

		await runWrangler("deploy index.js --dry-run");

		expect(std.out).toContain("--dry-run: exiting now.");
		expect(std.err).toBe("");
	});

	it("fails validation for malformed addresses before uploading", async ({
		expect,
	}) => {
		writeWranglerConfig({
			// @ts-expect-error intentionally invalid entry type
			addresses: ["ok@example.com", 123],
		});
		fs.writeFileSync("index.js", "export default {};");

		await expect(runWrangler("deploy index.js --dry-run")).rejects.toThrow(
			/to be of type string/
		);
	});
});
