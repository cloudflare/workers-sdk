import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { clearOutputFilePath, writeOutput } from "../output";
import { runInTempDir } from "./helpers/run-in-tmp";
import type { OutputEntry } from "../output";

const originalProcessEnv = process.env;
const {
	WRANGLER_OUTPUT_FILE_DIRECTORY: _,
	WRANGLER_OUTPUT_FILE_PATH: __,
	...processEnvNoVars
} = originalProcessEnv;

describe("writeOutput()", () => {
	runInTempDir({ homedir: "home" });
	afterEach(clearOutputFilePath);

	it("should do nothing with no env vars set", () => {
		try {
			process.env = processEnvNoVars;
			writeOutput({
				type: "wrangler-session",
				version: 1,
				wrangler_version: "0.0.0.0",
				command_line_args: ["--help"],
				log_file_path: "some/log/path.log",
			});
			// No files written
			expect(readdirSync(".")).toEqual(["home"]);
		} finally {
			process.env = originalProcessEnv;
		}
	});

	it("should write to the file given by WRANGLER_OUTPUT_FILE_PATH", () => {
		try {
			const WRANGLER_OUTPUT_FILE_PATH = "output.json";
			process.env = { ...processEnvNoVars, WRANGLER_OUTPUT_FILE_PATH };
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
		} finally {
			process.env = originalProcessEnv;
		}
	});

	it("should write to the file given by WRANGLER_OUTPUT_FILE_PATH, ignoring WRANGLER_OUTPUT_FILE_DIRECTORY", () => {
		try {
			const WRANGLER_OUTPUT_FILE_PATH = "output.json";
			process.env = {
				...processEnvNoVars,
				WRANGLER_OUTPUT_FILE_PATH,
				WRANGLER_OUTPUT_FILE_DIRECTORY: ".",
			};
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
		} finally {
			process.env = originalProcessEnv;
		}
	});

	it("should write multiple entries to the file given by WRANGLER_OUTPUT_FILE_PATH", () => {
		try {
			const WRANGLER_OUTPUT_FILE_PATH = "output.json";
			process.env = { ...processEnvNoVars, WRANGLER_OUTPUT_FILE_PATH };
			writeOutput({
				type: "wrangler-session",
				version: 1,
				wrangler_version: "0.0.0.0",
				command_line_args: ["--help"],
				log_file_path: "some/log/path.log",
			});
			writeOutput({
				type: "deployment",
				version: 1,
				worker_name: "Worker",
				worker_tag: "ABCDE12345",
				deployment_id: "1234",
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
					type: "deployment",
					version: 1,
					worker_name: "Worker",
					worker_tag: "ABCDE12345",
					deployment_id: "1234",
				},
			]);
		} finally {
			process.env = originalProcessEnv;
		}
	});

	it("should write to a random file in WRANGLER_OUTPUT_FILE_DIRECTORY", () => {
		try {
			process.env = {
				...processEnvNoVars,
				WRANGLER_OUTPUT_FILE_DIRECTORY: "output",
			};
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
			const outputFile = readFileSync(
				join("output", outputFilePaths[0]),
				"utf8"
			);
			expect(outputFile).toContainEntries([
				{
					type: "wrangler-session",
					version: 1,
					wrangler_version: "0.0.0.0",
					command_line_args: ["--help"],
					log_file_path: "some/log/path.log",
				},
			]);
		} finally {
			process.env = originalProcessEnv;
		}
	});

	it("should write multiple entries to the same random file in WRANGLER_OUTPUT_FILE_DIRECTORY", () => {
		try {
			process.env = {
				...processEnvNoVars,
				WRANGLER_OUTPUT_FILE_DIRECTORY: "output",
			};
			writeOutput({
				type: "wrangler-session",
				version: 1,
				wrangler_version: "0.0.0.0",
				command_line_args: ["--help"],
				log_file_path: "some/log/path.log",
			});
			writeOutput({
				type: "deployment",
				version: 1,
				worker_name: "Worker",
				worker_tag: "ABCDE12345",
				deployment_id: "1234",
			});

			const outputFilePaths = readdirSync("output");
			expect(outputFilePaths.length).toEqual(1);
			expect(outputFilePaths[0]).toMatch(/wrangler-output-.+\.json/);
			const outputFile = readFileSync(
				join("output", outputFilePaths[0]),
				"utf8"
			);
			expect(outputFile).toContainEntries([
				{
					type: "wrangler-session",
					version: 1,
					wrangler_version: "0.0.0.0",
					command_line_args: ["--help"],
					log_file_path: "some/log/path.log",
				},
				{
					type: "deployment",
					version: 1,
					worker_name: "Worker",
					worker_tag: "ABCDE12345",
					deployment_id: "1234",
				},
			]);
		} finally {
			process.env = originalProcessEnv;
		}
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
