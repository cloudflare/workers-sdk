import * as fs from "node:fs";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import {
	ALLOW,
	categoriseArgs,
	categorisePositionalPath,
	COMMAND_ARG_ALLOW_LIST,
	getAllowedArgs,
	REDACT,
	sanitizeArgKeys,
	sanitizeArgValues,
} from "../../../src/metrics/sanitization";
import type { AllowedArgs, AllowList } from "../../../src/metrics/sanitization";

describe("sanitizeArgKeys", () => {
	it("should sanitize arg keys based on argv", ({ expect }) => {
		const args = {
			config: "wrangler.toml",
			env: "production",
			unknownArg: "shouldBeRemoved",
			"arg-one": true,
			"arg-two": true,
			argTwo: true,
			"x-new-idea": true,
			"experimental-new-idea": true,
			$0: "wrangler",
			_: [],
		};
		const argv = [
			"node",
			"wrangler",
			"deploy",
			"--config",
			"wrangler.toml",
			"--arg-one",
			"--arg-two",
			"--experimental-new-idea",
		];
		const sanitized = sanitizeArgKeys(args, argv);
		expect(sanitized).toEqual({
			config: "wrangler.toml",
			argOne: true,
			argTwo: true,
			xNewIdea: true,
		});
	});
});

describe("sanitizeArgValues", () => {
	it("should redact and allow arg values based on allowedArgs", ({
		expect,
	}) => {
		const sanitizedArgs = {
			config: "wrangler.toml",
			env: "production",
			force: true,
			dryRun: false,
		};
		const allowedArgs: AllowedArgs = {
			config: REDACT,
			env: ["production", "staging", "development"],
			force: ALLOW,
		};
		const result = sanitizeArgValues(sanitizedArgs, allowedArgs);
		expect(result).toEqual({
			config: "<REDACTED>",
			env: "production",
			force: true,
		});
	});
});

describe("getAllowedArgs", () => {
	it("should return allowed args for a given command", ({ expect }) => {
		const commandArgAllowList: AllowList = {
			deploy: {
				config: REDACT,
				force: ALLOW,
			},
			"*": {
				env: ["production", "staging", "development"],
			},
			"deploy *": {
				subArg: ALLOW,
			},
		};

		expect(getAllowedArgs(commandArgAllowList, "dev")).toEqual({
			env: ["production", "staging", "development"],
		});

		expect(getAllowedArgs(commandArgAllowList, "deploy")).toEqual({
			config: REDACT,
			force: ALLOW,
			env: ["production", "staging", "development"],
		});

		expect(getAllowedArgs(commandArgAllowList, "deploy sub")).toEqual({
			config: REDACT,
			force: ALLOW,
			env: ["production", "staging", "development"],
			subArg: ALLOW,
		});
	});

	it("should allow more specific command rules to override less specific ones", ({
		expect,
	}) => {
		const commandArgAllowList: AllowList = {
			"*": { global: ALLOW, sharedArg: REDACT },
			"r2 bucket create": { sharedArg: REDACT, createOnly: ALLOW },
			"r2 bucket": { sharedArg: ALLOW, bucketOnly: ALLOW },
			r2: { sharedArg: ALLOW, r2Only: ALLOW },
		};

		// Most specific rule ("r2 bucket create") should win for sharedArg
		const createResult = getAllowedArgs(
			commandArgAllowList,
			"r2 bucket create"
		);
		expect(createResult.sharedArg).toBe(REDACT);
		expect(createResult.createOnly).toBe(ALLOW);
		expect(createResult.bucketOnly).toBe(ALLOW);
		expect(createResult.r2Only).toBe(ALLOW);
		expect(createResult.global).toBe(ALLOW);

		// "r2 bucket" should use its own rule for sharedArg
		const bucketResult = getAllowedArgs(commandArgAllowList, "r2 bucket");
		expect(bucketResult.sharedArg).toBe(ALLOW);
		expect(bucketResult.bucketOnly).toBe(ALLOW);
		expect(bucketResult.r2Only).toBe(ALLOW);
		expect(bucketResult.global).toBe(ALLOW);

		// "r2" should use its own rule for sharedArg
		const r2Result = getAllowedArgs(commandArgAllowList, "r2");
		expect(r2Result.sharedArg).toBe(ALLOW);
		expect(r2Result.r2Only).toBe(ALLOW);
		expect(r2Result.global).toBe(ALLOW);
	});
});

describe("categorisePositionalPath", () => {
	runInTempDir();

	it("returns null when no value is provided", ({ expect }) => {
		expect(categorisePositionalPath(undefined)).toBeNull();
		expect(categorisePositionalPath("")).toBeNull();
		expect(categorisePositionalPath(123)).toBeNull();
	});

	it("categorises the current directory reference", ({ expect }) => {
		expect(categorisePositionalPath(".")).toBe("current-dir");
		expect(categorisePositionalPath("./")).toBe("current-dir");
	});

	it("categorises parent-relative references", ({ expect }) => {
		expect(categorisePositionalPath("..")).toBe("parent-relative");
		expect(categorisePositionalPath("../example")).toBe("parent-relative");
		expect(categorisePositionalPath("../../dist")).toBe("parent-relative");
	});

	it("categorises an existing directory", ({ expect }) => {
		fs.mkdirSync("./public");
		expect(categorisePositionalPath("./public")).toBe("directory");
		expect(categorisePositionalPath("public")).toBe("directory");
	});

	it("categorises an existing file", ({ expect }) => {
		fs.writeFileSync("./index.js", "export default {};");
		expect(categorisePositionalPath("./index.js")).toBe("file");
		expect(categorisePositionalPath("index.js")).toBe("file");
	});

	it("categorises a path that does not exist as not-found", ({ expect }) => {
		expect(categorisePositionalPath("does-not-exist")).toBe("not-found");
		expect(categorisePositionalPath("src/missing.ts")).toBe("not-found");
	});
});

describe("categoriseArgs", () => {
	runInTempDir();

	it("only categorises args whose allow-list entry is a categoriser", ({
		expect,
	}) => {
		fs.mkdirSync("./public");
		const allowedArgs: AllowedArgs = {
			path: categorisePositionalPath,
			force: ALLOW,
			config: REDACT,
		};
		const result = categoriseArgs(
			{ path: "./public", force: true, config: "wrangler.toml" },
			allowedArgs
		);
		expect(result).toEqual({ path: "directory" });
	});

	it("reads positional values straight from the full args object", ({
		expect,
	}) => {
		// `path` here mirrors the positional set by yargs, which sanitizeArgKeys
		// would otherwise drop because it is not passed as `--path` in argv.
		const result = categoriseArgs(
			{ path: "../example" },
			{ path: categorisePositionalPath }
		);
		expect(result).toEqual({ path: "parent-relative" });
	});

	it("records null when a positional is absent", ({ expect }) => {
		const result = categoriseArgs(
			{ path: undefined },
			{ path: categorisePositionalPath }
		);
		expect(result).toEqual({ path: null });
	});

	it("omits args when the categoriser returns undefined", ({ expect }) => {
		const result = categoriseArgs(
			{ path: "anything" },
			{ path: () => undefined }
		);
		expect(result).toEqual({});
	});
});

describe("COMMAND_ARG_ALLOW_LIST", () => {
	it("should pass boolean flag values through the full sanitisation pipeline for any command", ({
		expect,
	}) => {
		// Simulate a user running: wrangler <command> --remote --dry-run --json
		const args = {
			remote: true,
			"dry-run": true,
			dryRun: true,
			json: true,
			$0: "wrangler",
			_: [],
		};
		const argv = [
			"node",
			"wrangler",
			"some-command",
			"--remote",
			"--dry-run",
			"--json",
		];

		const argsWithSanitizedKeys = sanitizeArgKeys(args, argv);
		const allowedArgs = getAllowedArgs(COMMAND_ARG_ALLOW_LIST, "some-command");
		const sanitizedArgs = sanitizeArgValues(argsWithSanitizedKeys, allowedArgs);

		expect(sanitizedArgs).toEqual({
			remote: true,
			dryRun: true,
			json: true,
		});
	});
});
