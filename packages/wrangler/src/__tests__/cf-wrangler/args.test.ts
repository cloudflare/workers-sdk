import { describe, it } from "vitest";
import {
	ArgParseError,
	parseArgs,
	parseBuildArgs,
} from "../../cf-wrangler/args";

describe("cf-wrangler parseArgs", () => {
	describe("happy paths", () => {
		it("parses all flags in --flag value form", ({ expect }) => {
			const out = parseArgs([
				"--mode",
				"production",
				"--port",
				"8788",
				"--host",
				"example.com",
				"--local",
			]);
			expect(out).toEqual({
				mode: "production",
				port: 8788,
				host: "example.com",
				local: true,
			});
		});

		it("parses all flags in --flag=value form", ({ expect }) => {
			const out = parseArgs([
				"--mode=production",
				"--port=8788",
				"--host=example.com",
				"--local",
			]);
			expect(out).toEqual({
				mode: "production",
				port: 8788,
				host: "example.com",
				local: true,
			});
		});

		it("returns an empty object for no flags", ({ expect }) => {
			expect(parseArgs([])).toEqual({});
		});

		it("omits unset flags from the output", ({ expect }) => {
			const out = parseArgs(["--port", "8788"]);
			expect(out).toEqual({ port: 8788 });
			expect(out.mode).toBeUndefined();
			expect(out.local).toBeUndefined();
		});

		it("accepts port 0 (OS-assigned)", ({ expect }) => {
			expect(parseArgs(["--port", "0"])).toEqual({ port: 0 });
		});

		it("accepts port 65535 (max)", ({ expect }) => {
			expect(parseArgs(["--port", "65535"])).toEqual({ port: 65535 });
		});
	});

	describe("port validation", () => {
		// `--port -1` is rejected by `node:util.parseArgs` itself
		// (it reads `-1` as a flag, not a value). Negative ports
		// pass through to our coercion only via `--port=-N`.
		it("rejects negative ports (--port=-1 form)", ({ expect }) => {
			expect(() => parseArgs(["--port=-1"])).toThrow(ArgParseError);
			expect(() => parseArgs(["--port=-1"])).toThrow(
				/integer between 0 and 65535/
			);
		});

		it("rejects ports above 65535", ({ expect }) => {
			expect(() => parseArgs(["--port", "99999"])).toThrow(
				/integer between 0 and 65535/
			);
		});

		it("rejects fractional ports", ({ expect }) => {
			expect(() => parseArgs(["--port", "1.5"])).toThrow(
				/integer between 0 and 65535/
			);
		});

		it("rejects non-numeric ports", ({ expect }) => {
			expect(() => parseArgs(["--port", "abc"])).toThrow(
				/integer between 0 and 65535/
			);
		});
	});

	describe("rejected flags (allowNegative disabled)", () => {
		it("rejects --no-local with an unknown-flag error", ({ expect }) => {
			expect(() => parseArgs(["--no-local"])).toThrow(ArgParseError);
			expect(() => parseArgs(["--no-local"])).toThrow(/Unknown option/);
		});

		it("rejects --remote (whole-worker remote dev is out of scope)", ({
			expect,
		}) => {
			expect(() => parseArgs(["--remote"])).toThrow(/Unknown option/);
		});

		it("rejects other wrangler dev flags we don't support", ({ expect }) => {
			expect(() => parseArgs(["--var", "FOO:bar"])).toThrow(/Unknown option/);
			expect(() => parseArgs(["--define", "X=1"])).toThrow(/Unknown option/);
			expect(() => parseArgs(["--tsconfig", "tsconfig.json"])).toThrow(
				/Unknown option/
			);
			expect(() => parseArgs(["--assets", "./public"])).toThrow(
				/Unknown option/
			);
		});

		it("rejects --env (must use --mode)", ({ expect }) => {
			expect(() => parseArgs(["--env", "production"])).toThrow(
				/Unknown option/
			);
		});

		it("rejects --config (config comes from wrangler's discovery)", ({
			expect,
		}) => {
			expect(() => parseArgs(["--config", "wrangler.jsonc"])).toThrow(
				/Unknown option/
			);
		});
	});

	describe("structural rejections", () => {
		it("rejects positional arguments", ({ expect }) => {
			expect(() => parseArgs(["./worker.ts"])).toThrow(ArgParseError);
			expect(() => parseArgs(["./worker.ts"])).toThrow(/positional/);
		});

		it("rejects unknown flags", ({ expect }) => {
			expect(() => parseArgs(["--definitely-not-a-flag"])).toThrow(
				/Unknown option/
			);
		});
	});

	describe("ArgParseError", () => {
		it("wraps node:util.parseArgs errors", ({ expect }) => {
			try {
				parseArgs(["--remote"]);
				expect.fail("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(ArgParseError);
				expect((err as Error).name).toBe("ArgParseError");
			}
		});
	});
});

describe("cf-wrangler parseBuildArgs", () => {
	describe("happy paths", () => {
		it("returns an empty object for no flags", ({ expect }) => {
			expect(parseBuildArgs([])).toEqual({});
		});

		it("parses --mode", ({ expect }) => {
			expect(parseBuildArgs(["--mode", "production"])).toEqual({
				mode: "production",
			});
		});

		it("parses --mode=value", ({ expect }) => {
			expect(parseBuildArgs(["--mode=production"])).toEqual({
				mode: "production",
			});
		});
	});

	describe("rejections", () => {
		it("rejects --env (must use --mode)", ({ expect }) => {
			expect(() => parseBuildArgs(["--env", "production"])).toThrow(
				ArgParseError
			);
			expect(() => parseBuildArgs(["--env", "production"])).toThrow(
				/Unknown option/
			);
		});

		it("rejects --config (config comes from wrangler's discovery)", ({
			expect,
		}) => {
			expect(() => parseBuildArgs(["--config", "wrangler.json"])).toThrow(
				/Unknown option/
			);
		});

		it("rejects unknown flags", ({ expect }) => {
			expect(() => parseBuildArgs(["--definitely-not-a-flag"])).toThrow(
				/Unknown option/
			);
		});

		it("rejects positional arguments", ({ expect }) => {
			expect(() => parseBuildArgs(["./worker.ts"])).toThrow(ArgParseError);
			expect(() => parseBuildArgs(["./worker.ts"])).toThrow(/positional/);
		});
	});
});
