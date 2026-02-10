/* eslint-disable @typescript-eslint/no-empty-object-type */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FatalError } from "@cloudflare/workers-utils";
/* eslint-disable workers-sdk/no-vitest-import-expect -- uses custom matchers (expect.extend) */
import { afterEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { clearOutputFilePath, writeOutput } from "../output";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { OutputEntry } from "../output";

describe("writeOutput()", () => {
	runInTempDir({ homedir: "home" });
	afterEach(clearOutputFilePath);
	mockConsoleMethods();

	it("should do nothing with no env vars set", () => {
		vi.stubEnv("WRANGLER_OUTPUT_FILE_DIRECTORY", "");
		vi.stubEnv("WRANGLER_OUTPUT_FILE_PATH", "");
		writeOutput({
			type: "wrangler-session",
			version: 1,
			wrangler_version: "0.0.0.0",
			command_line_args: ["--help"],
			log_file_path: "some/log/path.log",
		});
		// No files written
		expect(readdirSync(".")).toEqual(["home"]);
	});

	it("should write to the file given by WRANGLER_OUTPUT_FILE_PATH", () => {
		const WRANGLER_OUTPUT_FILE_PATH = "output.json";
		vi.stubEnv("WRANGLER_OUTPUT_FILE_DIRECTORY", "");
		vi.stubEnv("WRANGLER_OUTPUT_FILE_PATH", WRANGLER_OUTPUT_FILE_PATH);
		writeOutput({
			type: "wrangler-session",
			version: 1,
			wrangler_version: "0.0.0.0",
			command_line_args: ["--help"],
			log_file_path: "some/log/path.log",
		});
		const outputFile = readFileSync(WRANGLER_OUTPUT_FILE_PATH, "utf8");
		expect(outputFile).toContainEntries([
			{
				type: "wrangler-session",
				version: 1,
				wrangler_version: "0.0.0.0",
				command_line_args: ["--help"],
				log_file_path: "some/log/path.log",
			},
		]);
	});

	it("should write to the file given by WRANGLER_OUTPUT_FILE_PATH, ignoring WRANGLER_OUTPUT_FILE_DIRECTORY", () => {
		const WRANGLER_OUTPUT_FILE_PATH = "output.json";
		vi.stubEnv("WRANGLER_OUTPUT_FILE_DIRECTORY", ".");
		vi.stubEnv("WRANGLER_OUTPUT_FILE_PATH", WRANGLER_OUTPUT_FILE_PATH);
		writeOutput({
			type: "wrangler-session",
			version: 1,
			wrangler_version: "0.0.0.0",
			command_line_args: ["--help"],
			log_file_path: "some/log/path.log",
		});
		const outputFile = readFileSync(WRANGLER_OUTPUT_FILE_PATH, "utf8");
		expect(outputFile).toContainEntries([
			{
				type: "wrangler-session",
				version: 1,
				wrangler_version: "0.0.0.0",
				command_line_args: ["--help"],
				log_file_path: "some/log/path.log",
			},
		]);
	});

	it("should write multiple entries to the file given by WRANGLER_OUTPUT_FILE_PATH", () => {
		const WRANGLER_OUTPUT_FILE_PATH = "output.json";
		vi.stubEnv("WRANGLER_OUTPUT_FILE_DIRECTORY", "");
		vi.stubEnv("WRANGLER_OUTPUT_FILE_PATH", WRANGLER_OUTPUT_FILE_PATH);
		writeOutput({
			type: "wrangler-session",
			version: 1,
			wrangler_version: "0.0.0.0",
			command_line_args: ["--help"],
			log_file_path: "some/log/path.log",
		});
		writeOutput({
			type: "deploy",
			version: 1,
			worker_name: "Worker",
			worker_tag: "ABCDE12345",
			version_id: "1234",
			targets: undefined,
			worker_name_overridden: false,
			wrangler_environment: undefined,
		});

		const outputFile = readFileSync(WRANGLER_OUTPUT_FILE_PATH, "utf8");
		expect(outputFile).toContainEntries([
			{
				type: "wrangler-session",
				version: 1,
				wrangler_version: "0.0.0.0",
				command_line_args: ["--help"],
				log_file_path: "some/log/path.log",
			},
			{
				type: "deploy",
				version: 1,
				worker_name: "Worker",
				worker_tag: "ABCDE12345",
				version_id: "1234",
				targets: undefined,
				worker_name_overridden: false,
				wrangler_environment: undefined,
			},
		]);
	});

	it("should write to a random file in WRANGLER_OUTPUT_FILE_DIRECTORY", () => {
		vi.stubEnv("WRANGLER_OUTPUT_FILE_DIRECTORY", "output");
		vi.stubEnv("WRANGLER_OUTPUT_FILE_PATH", "");
		writeOutput({
			type: "wrangler-session",
			version: 1,
			wrangler_version: "0.0.0.0",
			command_line_args: ["--help"],
			log_file_path: "some/log/path.log",
		});

		const outputFilePaths = readdirSync("output");
		expect(outputFilePaths.length).toEqual(1);
		expect(outputFilePaths[0]).toMatch(/wrangler-output-.+\.json/);
		const outputFile = readFileSync(join("output", outputFilePaths[0]), "utf8");
		expect(outputFile).toContainEntries([
			{
				type: "wrangler-session",
				version: 1,
				wrangler_version: "0.0.0.0",
				command_line_args: ["--help"],
				log_file_path: "some/log/path.log",
			},
		]);
	});

	it("should write multiple entries to the same random file in WRANGLER_OUTPUT_FILE_DIRECTORY", () => {
		vi.stubEnv("WRANGLER_OUTPUT_FILE_DIRECTORY", "output");
		vi.stubEnv("WRANGLER_OUTPUT_FILE_PATH", "");
		writeOutput({
			type: "wrangler-session",
			version: 1,
			wrangler_version: "0.0.0.0",
			command_line_args: ["--help"],
			log_file_path: "some/log/path.log",
		});
		writeOutput({
			type: "deploy",
			version: 1,
			worker_name: "Worker",
			worker_tag: "ABCDE12345",
			version_id: "1234",
			targets: undefined,
			worker_name_overridden: false,
			wrangler_environment: undefined,
		});

		const outputFilePaths = readdirSync("output");
		expect(outputFilePaths.length).toEqual(1);
		expect(outputFilePaths[0]).toMatch(/wrangler-output-.+\.json/);
		const outputFile = readFileSync(join("output", outputFilePaths[0]), "utf8");
		expect(outputFile).toContainEntries([
			{
				type: "wrangler-session",
				version: 1,
				wrangler_version: "0.0.0.0",
				command_line_args: ["--help"],
				log_file_path: "some/log/path.log",
			},
			{
				type: "deploy",
				version: 1,
				worker_name: "Worker",
				worker_tag: "ABCDE12345",
				version_id: "1234",
				targets: undefined,
				worker_name_overridden: false,
				wrangler_environment: undefined,
			},
		]);
	});

	it("should write an alias and environment for pages-deploy-detailed outputs", () => {
		vi.stubEnv("WRANGLER_OUTPUT_FILE_DIRECTORY", "output");
		vi.stubEnv("WRANGLER_OUTPUT_FILE_PATH", "");
		writeOutput({
			type: "wrangler-session",
			version: 1,
			wrangler_version: "0.0.0.0",
			command_line_args: ["--help"],
			log_file_path: "some/log/path.log",
		});
		writeOutput({
			type: "pages-deploy-detailed",
			version: 1,
			pages_project: "pages",
			deployment_id: "ABCDE12345",
			url: "test.com",
			alias: "dev.com",
			environment: "production",
			production_branch: "production-branch",
			deployment_trigger: {
				metadata: {
					commit_hash: "bc286bd30cf12b7fdbce046be6e53ce12ae1283d",
				},
			},
		});

		const outputFilePaths = readdirSync("output");
		expect(outputFilePaths.length).toEqual(1);
		expect(outputFilePaths[0]).toMatch(/wrangler-output-.+\.json/);
		const outputFile = readFileSync(join("output", outputFilePaths[0]), "utf8");
		expect(outputFile).toContainEntries([
			{
				type: "wrangler-session",
				version: 1,
				wrangler_version: "0.0.0.0",
				command_line_args: ["--help"],
				log_file_path: "some/log/path.log",
			},
			{
				type: "pages-deploy-detailed",
				version: 1,
				pages_project: "pages",
				deployment_id: "ABCDE12345",
				url: "test.com",
				alias: "dev.com",
				environment: "production",
				production_branch: "production-branch",
				deployment_trigger: {
					metadata: {
						commit_hash: "bc286bd30cf12b7fdbce046be6e53ce12ae1283d",
					},
				},
			},
		]);
	});

	it("should write an error log when a handler throws an error", async () => {
		vi.mock("../user/whoami", () => {
			return {
				whoami: vi.fn().mockImplementation(() => {
					throw new FatalError(
						"A request to the Cloudflare API failed.",
						10211
					);
				}),
			};
		});

		const WRANGLER_OUTPUT_FILE_PATH = "output.json";
		vi.stubEnv("WRANGLER_OUTPUT_FILE_DIRECTORY", "");
		vi.stubEnv("WRANGLER_OUTPUT_FILE_PATH", WRANGLER_OUTPUT_FILE_PATH);

		await expect(runWrangler("whoami")).rejects.toThrow();

		const outputFile = readFileSync(WRANGLER_OUTPUT_FILE_PATH, "utf8");
		const entries = outputFile
			.split("\n")
			.filter(Boolean)
			.map((e) => JSON.parse(e));
		expect(entries).toHaveLength(2);
		expect(entries[0].type).toBe("wrangler-session");
		expect(entries[1]).toMatchObject({
			version: 1,
			type: "command-failed",
			// excluding timestamp
			message: "A request to the Cloudflare API failed.",
			code: 10211,
		});
	});
});

expect.extend({
	toContainEntries(received: string, expected: OutputEntry[]) {
		const actual = received
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));

		const stamped = expected.map((entry) => ({
			...entry,
			timestamp: expect.any(String),
		}));

		return {
			pass: this.equals(actual, stamped),
			message: () => `Entries are${this.isNot ? "" : " not"} as expected.`,
			actual,
			expected: stamped,
		};
	},
});

interface CustomMatchers {
	toContainEntries: (expected: OutputEntry[]) => unknown;
}

declare module "vitest" {
	interface Assertion extends CustomMatchers {}
	interface AsymmetricMatchersContaining extends CustomMatchers {}
}
