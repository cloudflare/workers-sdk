import { describe, it } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- bin/wrangler.js is a plain CommonJS script
const { resolveExitCode } = require("../../bin/wrangler.js");

describe("bin/wrangler.js resolveExitCode", () => {
	const std = mockConsoleMethods();

	it("passes through a normal numeric exit code", ({ expect }) => {
		expect(resolveExitCode(0, null)).toBe(0);
		expect(resolveExitCode(1, null)).toBe(1);
	});

	it("reports a non-zero exit code when killed by a signal", ({ expect }) => {
		expect(resolveExitCode(null, "SIGKILL")).toBe(1);
		expect(std.err).toContain("SIGKILL");
	});

	it("reports a non-zero exit code for SIGTERM", ({ expect }) => {
		expect(resolveExitCode(null, "SIGTERM")).toBe(1);
		expect(std.err).toContain("SIGTERM");
	});

	it("defaults to a non-zero exit code when code and signal are both missing", ({
		expect,
	}) => {
		expect(resolveExitCode(undefined, null)).toBe(1);
	});
});
