import { describe, expect, it } from "vitest";
import {
	ALLOW,
	getAllowedArgs,
	REDACT,
	sanitizeArgKeys,
	sanitizeArgValues,
} from "../../../src/metrics/sanitization";
import type { AllowedArgs, AllowList } from "../../../src/metrics/sanitization";

describe("sanitizeArgKeys", () => {
	it("should sanitize arg keys based on argv", () => {
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
	it("should redact and allow arg values based on allowedArgs", () => {
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
	it("should return allowed args for a given command", () => {
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

	it("should allow more specific command rules to override less specific ones", () => {
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
