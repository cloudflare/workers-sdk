import { describe, expect, it } from "vitest";
import {
	ALLOW,
	getAllowedArgs,
	REDACT,
	sanitizeArgKeys,
	sanitizeArgValues,
} from "../../../src/metrics/sanitization";
import type { AllowedArgs, AllowList } from "../../../src/metrics/sanitization";
import type { NamedArgDefinitions } from "../../core/types";

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
		const sanitized = sanitizeArgKeys(undefined, args, argv);
		expect(sanitized).toEqual({
			config: "wrangler.toml",
			argOne: true,
			argTwo: true,
			xNewIdea: true,
		});
	});

	it("should recognize single-character aliases from argDefs", () => {
		const args = {
			config: "wrangler.toml",
			message: "rollback reason",
			$0: "wrangler",
			_: [],
		};
		const argv = ["node", "wrangler", "rollback", "-c", "wrangler.toml", "-m"];
		const argDefs: NamedArgDefinitions = {
			config: { type: "string", alias: "c" },
			message: { type: "string", alias: "m" },
		};
		const sanitized = sanitizeArgKeys(argDefs, args, argv);
		expect(sanitized).toEqual({
			config: "wrangler.toml",
			message: "rollback reason",
		});
	});

	it("should recognize long aliases from an array of aliases", () => {
		const args = {
			triggers: ["0 * * * *"],
			$0: "wrangler",
			_: [],
		};
		const argv = ["node", "wrangler", "deploy", "--schedule"];
		const argDefs: NamedArgDefinitions = {
			triggers: {
				type: "string",
				array: true,
				alias: ["schedule", "schedules"],
			},
		};
		const sanitized = sanitizeArgKeys(argDefs, args, argv);
		expect(sanitized).toEqual({
			triggers: ["0 * * * *"],
		});
	});

	it("should recognize long aliases with double dash", () => {
		const args = {
			"project-name": "my-project",
			$0: "wrangler",
			_: [],
		};
		const argv = ["node", "wrangler", "pages", "secret", "put", "--project"];
		const argDefs: NamedArgDefinitions = {
			"project-name": { type: "string", alias: "project" },
		};
		const sanitized = sanitizeArgKeys(argDefs, args, argv);
		expect(sanitized).toEqual({
			projectName: "my-project",
		});
	});

	it("should work without argDefs (backwards compatibility)", () => {
		const args = {
			config: "wrangler.toml",
			$0: "wrangler",
			_: [],
		};
		const argv = ["node", "wrangler", "deploy", "--config", "wrangler.toml"];
		const sanitized = sanitizeArgKeys(undefined, args, argv);
		expect(sanitized).toEqual({
			config: "wrangler.toml",
		});
	});

	it("should include all args when argv is undefined", () => {
		const args = {
			config: "wrangler.toml",
			env: "production",
			$0: "wrangler",
			_: [],
		};
		const sanitized = sanitizeArgKeys(undefined, args, undefined);
		expect(sanitized).toEqual({
			config: "wrangler.toml",
			env: "production",
		});
	});

	it("should recognize uppercase single-character aliases", () => {
		const args = {
			jurisdiction: "eu",
			$0: "wrangler",
			_: [],
		};
		const argv = ["node", "wrangler", "r2", "bucket", "create", "-J", "eu"];
		const argDefs: NamedArgDefinitions = {
			jurisdiction: { type: "string", alias: "J" },
		};
		const sanitized = sanitizeArgKeys(argDefs, args, argv);
		expect(sanitized).toEqual({
			jurisdiction: "eu",
		});
	});

	it("should handle alias that differs from first character of arg name", () => {
		const args = {
			force: true,
			$0: "wrangler",
			_: [],
		};
		// "force" uses "y" as alias (for "yes" semantics), not "f"
		const argv = ["node", "wrangler", "r2", "lock", "-y"];
		const argDefs: NamedArgDefinitions = {
			force: { type: "boolean", alias: "y" },
		};
		const sanitized = sanitizeArgKeys(argDefs, args, argv);
		expect(sanitized).toEqual({
			force: true,
		});
	});

	it("should not match when using wrong short flag without argDefs", () => {
		const args = {
			force: true,
			$0: "wrangler",
			_: [],
		};
		// Without argDefs, -y won't match "force" (old behavior would check -f)
		const argv = ["node", "wrangler", "command", "-y"];
		const sanitized = sanitizeArgKeys(undefined, args, argv);
		expect(sanitized).toEqual({});
	});

	it("should handle mix of long-form and short aliases in same command", () => {
		const args = {
			config: "wrangler.toml",
			env: "production",
			yes: true,
			$0: "wrangler",
			_: [],
		};
		const argv = [
			"node",
			"wrangler",
			"deploy",
			"--config",
			"wrangler.toml",
			"-e",
			"production",
			"-y",
		];
		const argDefs: NamedArgDefinitions = {
			config: { type: "string", alias: "c" },
			env: { type: "string", alias: "e" },
			yes: { type: "boolean", alias: "y" },
		};
		const sanitized = sanitizeArgKeys(argDefs, args, argv);
		expect(sanitized).toEqual({
			config: "wrangler.toml",
			env: "production",
			yes: true,
		});
	});

	it("should handle arg with no alias defined in argDefs", () => {
		const args = {
			config: "wrangler.toml",
			"dry-run": true,
			$0: "wrangler",
			_: [],
		};
		const argv = ["node", "wrangler", "deploy", "-c", "wrangler.toml"];
		const argDefs: NamedArgDefinitions = {
			config: { type: "string", alias: "c" },
			"dry-run": { type: "boolean" }, // no alias
		};
		const sanitized = sanitizeArgKeys(argDefs, args, argv);
		// dry-run has no alias and --dry-run wasn't in argv, so it's excluded
		expect(sanitized).toEqual({
			config: "wrangler.toml",
		});
	});

	it("should not include arg when neither long form nor alias is in argv", () => {
		const args = {
			config: "wrangler.toml",
			env: "production",
			$0: "wrangler",
			_: [],
		};
		const argv = ["node", "wrangler", "deploy", "--config", "wrangler.toml"];
		const argDefs: NamedArgDefinitions = {
			config: { type: "string", alias: "c" },
			env: { type: "string", alias: "e" },
		};
		const sanitized = sanitizeArgKeys(argDefs, args, argv);
		// env is in args but neither --env nor -e is in argv
		expect(sanitized).toEqual({
			config: "wrangler.toml",
		});
	});

	it("should handle empty alias array", () => {
		const args = {
			config: "wrangler.toml",
			$0: "wrangler",
			_: [],
		};
		const argv = ["node", "wrangler", "deploy", "--config", "wrangler.toml"];
		const argDefs: NamedArgDefinitions = {
			config: { type: "string", alias: [] },
		};
		const sanitized = sanitizeArgKeys(argDefs, args, argv);
		expect(sanitized).toEqual({
			config: "wrangler.toml",
		});
	});

	it("should recognize single-char aliases in short option groups", () => {
		const args = {
			config: "wrangler.toml",
			yes: true,
			force: true,
			$0: "wrangler",
			_: [],
		};
		// yargs parses -yf as -y -f (short option groups)
		const argv = ["node", "wrangler", "deploy", "-yf", "--config"];
		const argDefs: NamedArgDefinitions = {
			config: { type: "string", alias: "c" },
			yes: { type: "boolean", alias: "y" },
			force: { type: "boolean", alias: "f" },
		};
		const sanitized = sanitizeArgKeys(argDefs, args, argv);
		expect(sanitized).toEqual({
			config: "wrangler.toml",
			yes: true,
			force: true,
		});
	});

	it("should recognize single-char alias in longer short option group", () => {
		const args = {
			a: true,
			b: true,
			c: true,
			$0: "wrangler",
			_: [],
		};
		// yargs parses -abc as -a -b -c
		const argv = ["node", "wrangler", "command", "-abc"];
		const argDefs: NamedArgDefinitions = {
			a: { type: "boolean", alias: "a" },
			b: { type: "boolean", alias: "b" },
			c: { type: "boolean", alias: "c" },
		};
		const sanitized = sanitizeArgKeys(argDefs, args, argv);
		expect(sanitized).toEqual({
			a: true,
			b: true,
			c: true,
		});
	});

	it("should handle flags with = sign (--config=value)", () => {
		const args = {
			config: "wrangler.toml",
			env: "production",
			$0: "wrangler",
			_: [],
		};
		const argv = [
			"node",
			"wrangler",
			"deploy",
			"--config=wrangler.toml",
			"--env=production",
		];
		const argDefs: NamedArgDefinitions = {
			config: { type: "string", alias: "c" },
			env: { type: "string", alias: "e" },
		};
		const sanitized = sanitizeArgKeys(argDefs, args, argv);
		expect(sanitized).toEqual({
			config: "wrangler.toml",
			env: "production",
		});
	});

	it("should handle short flags with = sign (-c=value)", () => {
		const args = {
			config: "wrangler.toml",
			$0: "wrangler",
			_: [],
		};
		const argv = ["node", "wrangler", "deploy", "-c=wrangler.toml"];
		const argDefs: NamedArgDefinitions = {
			config: { type: "string", alias: "c" },
		};
		const sanitized = sanitizeArgKeys(argDefs, args, argv);
		expect(sanitized).toEqual({
			config: "wrangler.toml",
		});
	});

	it("should handle flags with spaces around = sign (quoted '--arg = value')", () => {
		const args = {
			arg: "value",
			$0: "wrangler",
			_: [],
		};
		// This can happen if argv is constructed programmatically or quoted in shell
		const argv = ["node", "wrangler", "command", "--arg = value"];
		const sanitized = sanitizeArgKeys(undefined, args, argv);
		expect(sanitized).toEqual({
			arg: "value",
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
