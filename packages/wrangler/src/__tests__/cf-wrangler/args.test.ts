import { describe, it } from "vitest";
import {
	ArgParseError,
	parseArgs,
	parseBuildArgs,
} from "../../cf-wrangler/args";

describe("cf-wrangler parseArgs", () => {
	it.for([
		[
			"--mode",
			"production",
			"--port",
			"8788",
			"--host",
			"example.com",
			"--local",
			"--inspector-port",
			"9229",
		],
		[
			"--mode=production",
			"--port=8788",
			"--host=example.com",
			"--local",
			"--inspector-port=9229",
		],
	])("parses separate and equals forms: %j", (argv, { expect }) => {
		expect(parseArgs(argv)).toMatchObject({
			env: "production",
			port: 8788,
			host: "example.com",
			local: true,
			inspectorPort: 9229,
		});
	});

	it("preserves the delegate defaults", ({ expect }) => {
		expect(parseArgs([])).toMatchObject({
			remote: false,
			latest: true,
			noBundle: false,
			testScheduled: false,
			experimentalAutoCreate: false,
			experimentalProvision: false,
			experimentalNewConfig: true,
			types: false,
		});
		expect(parseArgs([]).env).toBeUndefined();
		expect(parseArgs([]).config).toBeUndefined();
		expect(parseArgs([]).local).toBeUndefined();
	});

	it("uses Wrangler aliases, repeated string options, and boolean negation", ({
		expect,
	}) => {
		expect(
			parseArgs([
				"--compatibility-flag",
				"nodejs_compat",
				"--compatibility-flags=some_other_flag",
				"--route",
				"example.com/*",
				"--route=example.org/*",
				"-l",
				"--no-live-reload",
				"--no-infer-origin-from-routes",
				"--test-scheduled",
			])
		).toMatchObject({
			compatibilityFlags: ["nodejs_compat", "some_other_flag"],
			routes: ["example.com/*", "example.org/*"],
			local: true,
			liveReload: false,
			inferOriginFromRoutes: false,
			testScheduled: true,
		});
	});

	it("preserves string values and argument boundaries", ({ expect }) => {
		expect(
			parseArgs([
				"--mode",
				"001",
				"--var",
				"ID:000123",
				"--var=TEXT:hello world",
				"--define",
				'TEXT:"a=b c"',
				"--tsconfig",
				"configs with spaces/001.json",
				"--assets=001",
				"--host",
				"000123",
				"--persist-to",
				"C:\\my state\\001",
			])
		).toMatchObject({
			env: "001",
			var: ["ID:000123", "TEXT:hello world"],
			define: ['TEXT:"a=b c"'],
			tsconfig: "configs with spaces/001.json",
			assets: "001",
			host: "000123",
			persistTo: "C:\\my state\\001",
		});
	});

	it.for(["port", "inspector-port"])(
		"accepts the limits of --%s",
		(flag, { expect }) => {
			for (const value of [0, 65535]) {
				expect(parseArgs([`--${flag}`, String(value)])).toHaveProperty(
					flag === "port" ? "port" : "inspectorPort",
					value
				);
			}
		}
	);

	it.for(["port", "inspector-port"])(
		"rejects invalid --%s values",
		(flag, { expect }) => {
			for (const value of ["-1", "65536", "1.5", "abc", "NaN", "Infinity"]) {
				for (const argv of [[`--${flag}=${value}`], [`--${flag}`, value]]) {
					expect(() => parseArgs(argv)).toThrow(ArgParseError);
				}
			}
		}
	);

	it.for([
		["--no-local"],
		["--local=false"],
		["--remote"],
		["-r"],
		["--env", "production"],
		["-e", "production"],
		["--config", "wrangler.jsonc"],
		["-c", "wrangler.jsonc"],
		["--cwd", "elsewhere"],
		["--experimental-new-config=false"],
		["--x-new-config=false"],
		["--experimental-provision"],
		["--experimental-auto-create"],
		["--profile", "work"],
		["./worker.ts"],
		["--script", "./worker.ts"],
		["--definitely-not-a-flag"],
		["--my-vite-flag"],
		["--id", "001"],
		["--mode"],
		["--port"],
		["--inspector-port"],
		["--var"],
		["--local-protocol", "ftp"],
		["--log-level", "verbose"],
		["--port", "8787", "--port", "8788"],
		["--mode=a", "--mode=b"],
		["--https-key-path=a", "--https-key-path=b"],
		["--local-protocol=http", "--local-protocol=https"],
		["--inspector-port=9229", "--inspector-port=9230"],
		["--node-compat"],
		["--tunnel-name", "named", "--tunnel-allowed-mail", "user@example.com"],
		["--tunnel-name=named", "--tunnel-allowed-mail=user@example.com"],
	])("rejects invalid or unsupported arguments: %j", (argv, { expect }) => {
		expect(() => parseArgs(argv)).toThrow(ArgParseError);
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
