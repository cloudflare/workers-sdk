import { describe, it } from "vitest";
import { getSuggestion, logDidYouMean } from "../../utils/did-you-mean";
import { mockConsoleMethods } from "../helpers/mock-console";

describe("getSuggestion", () => {
	const commands = ["whoami", "deploy", "dev", "init", "pages", "kv", "r2"];

	it("should suggest the closest match for a typo", ({ expect }) => {
		expect(getSuggestion("whoamio", commands)).toBe("whoami");
	});

	it("should suggest 'deploy' for 'delpoy'", ({ expect }) => {
		expect(getSuggestion("delpoy", commands)).toBe("deploy");
	});

	it("should suggest 'dev' for 'dve'", ({ expect }) => {
		expect(getSuggestion("dve", commands)).toBe("dev");
	});

	it("should return undefined for a completely unrelated input", ({
		expect,
	}) => {
		expect(getSuggestion("xyzzy", commands)).toBeUndefined();
	});

	it("should be case-insensitive", ({ expect }) => {
		expect(getSuggestion("WHOAMIO", commands)).toBe("whoami");
	});

	it("should return undefined when candidates list is empty", ({ expect }) => {
		expect(getSuggestion("whoami", [])).toBeUndefined();
	});

	it("should return exact match when input matches a candidate", ({
		expect,
	}) => {
		expect(getSuggestion("deploy", commands)).toBe("deploy");
	});

	it("should respect custom maxDistance", ({ expect }) => {
		// "delpoy" is distance 2 from "deploy"
		expect(getSuggestion("delpoy", commands, 1)).toBeUndefined();
		expect(getSuggestion("delpoy", commands, 2)).toBe("deploy");
	});

	it("should work with Set input", ({ expect }) => {
		const commandSet = new Set(commands);
		expect(getSuggestion("whoamio", commandSet)).toBe("whoami");
	});
});

describe("logDidYouMean", () => {
	const std = mockConsoleMethods();
	const commands = ["whoami", "deploy", "dev", "init", "pages", "kv", "r2"];

	it("should log a suggestion in a box when a close match exists", ({
		expect,
	}) => {
		logDidYouMean("whoamio", commands, "wrangler");

		expect(std.info).toContain('Did you mean "wrangler whoami"?');
		expect(std.info).toContain("╭");
		expect(std.info).toContain("╰");
	});

	it("should not log anything when no close match exists", ({ expect }) => {
		logDidYouMean("xyzzy", commands, "wrangler");

		expect(std.info).not.toContain("Did you mean");
	});

	it("should include the full command prefix for subcommands", ({ expect }) => {
		const subcommands = ["namespace", "key", "bulk"];
		logDidYouMean("namespase", subcommands, "wrangler kv");

		expect(std.info).toContain('Did you mean "wrangler kv namespace"?');
	});

	it("should preserve trailing args after the typo", ({ expect }) => {
		const subcommands = ["namespace", "key", "bulk"];
		logDidYouMean("namespase", subcommands, "wrangler kv", ["create"]);

		expect(std.info).toContain('Did you mean "wrangler kv namespace create"?');
	});
});
