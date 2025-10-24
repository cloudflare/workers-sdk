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
			"wrangler deploy": {
				config: REDACT,
				force: ALLOW,
			},
			"wrangler *": {
				env: ["production", "staging", "development"],
			},
			"wrangler deploy *": {
				subArg: ALLOW,
			},
		};

		expect(getAllowedArgs(commandArgAllowList, "wrangler dev")).toEqual({
			env: ["production", "staging", "development"],
		});

		expect(getAllowedArgs(commandArgAllowList, "wrangler deploy")).toEqual({
			config: REDACT,
			force: ALLOW,
			env: ["production", "staging", "development"],
		});

		expect(getAllowedArgs(commandArgAllowList, "wrangler deploy sub")).toEqual({
			config: REDACT,
			force: ALLOW,
			env: ["production", "staging", "development"],
			subArg: ALLOW,
		});
	});
});
