import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { clearOutputFilePath, writeOutput } from "../output";
import { runInTempDir } from "./helpers/run-in-tmp";
import type { OutputEntry } from "../output";

describe("writeOutput()", () => {
	runInTempDir({ homedir: "home" });
	afterEach(clearOutputFilePath);

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
			},
		]);
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
