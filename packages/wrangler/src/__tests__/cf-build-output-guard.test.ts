import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { getRootConfigPath } from "@cloudflare/build-output-utils";
import { UserError } from "@cloudflare/workers-utils";
import {
	runInTempDir,
	seed,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
	assertNoCloudflareBuildOutput,
	findCloudflareBuildOutput,
} from "../deployment-bundle/cf-build-output-guard";
import { clearOutputFilePath } from "../output";
import { mockAccountId, mockApiToken } from "./helpers/mock-account-id";
import { mockConsoleMethods } from "./helpers/mock-console";
import { clearDialogs } from "./helpers/mock-dialogs";
import { useMockIsTTY } from "./helpers/mock-istty";
import { runWrangler } from "./helpers/run-wrangler";

/**
 * Write the Build Output root config that marks a project as built for `cf`.
 *
 * The location comes from the Build Output Specification helpers rather than a
 * literal path, so the guard is tested against wherever the spec puts the root
 * config rather than against a copy of it.
 */
async function seedBuildOutput(projectRoot = process.cwd()) {
	const rootConfigPath = getRootConfigPath(projectRoot);
	await seed({
		[rootConfigPath]: JSON.stringify({
			buildContext: { isPreview: false, mode: "production" },
		}),
	});
	return rootConfigPath;
}

/** No configuration file, so the project root is the working directory. */
const NO_USER_CONFIG = {
	config: { userConfigPath: undefined },
	explicitConfigPath: undefined,
	scriptPath: undefined,
};

/** A project named with `--config`. */
function selectedConfig(configPath: string) {
	return {
		config: { userConfigPath: configPath },
		explicitConfigPath: configPath,
		scriptPath: undefined,
	};
}

/** A configuration found by searching up from the working directory. */
function inheritedConfig(configPath: string) {
	return {
		config: { userConfigPath: configPath },
		explicitConfigPath: undefined,
		scriptPath: undefined,
	};
}

/** A project reached through a script argument outside the working directory. */
function scriptArgument(scriptPath: string, configPath: string) {
	return {
		config: { userConfigPath: configPath },
		explicitConfigPath: undefined,
		scriptPath,
	};
}

/**
 * Run `fn` from `directory`, restoring the working directory afterwards.
 *
 * The guard reads `process.cwd()` because that is where a build writes its
 * Build Output, so the nested cases have to move into the subproject.
 */
async function withCwd(directory: string, fn: () => Promise<void>) {
	const previous = process.cwd();
	process.chdir(directory);
	try {
		await fn();
	} finally {
		process.chdir(previous);
	}
}

/** Capture a thrown value without asserting on it, so fields can be inspected. */
function captureThrow(fn: () => void): unknown {
	try {
		fn();
	} catch (e) {
		return e;
	}
	return undefined;
}

describe("findCloudflareBuildOutput", () => {
	runInTempDir();

	it("detects a project built for `cf`", async ({ expect }) => {
		await seedBuildOutput();

		expect(findCloudflareBuildOutput(process.cwd())).toBe(
			path.resolve(".cloudflare/output")
		);
	});

	it("reports the documented `.cloudflare/output` location on every platform", async ({
		expect,
	}) => {
		await seedBuildOutput();

		const found = findCloudflareBuildOutput(process.cwd());
		assert(found !== undefined, "expected Build Output to be detected");
		// Compared as path segments so the assertion holds for both `/` and `\`.
		expect(path.relative(process.cwd(), found).split(path.sep)).toEqual([
			".cloudflare",
			"output",
		]);
	});

	it("ignores an ordinary Wrangler project", async ({ expect }) => {
		await seed({
			"wrangler.jsonc": JSON.stringify({ name: "test-name" }),
			"index.js": "export default {};",
		});

		expect(findCloudflareBuildOutput(process.cwd())).toBeUndefined();
	});

	it("ignores the `.cloudflare/types` directory Wrangler generates itself", async ({
		expect,
	}) => {
		await seed({
			".cloudflare/types/index.d.ts": "declare type Generated = true;",
		});

		expect(findCloudflareBuildOutput(process.cwd())).toBeUndefined();
	});

	it("ignores a `.cloudflare/output` directory with no versioned root config", async ({
		expect,
	}) => {
		await seed({ ".cloudflare/output/notes.md": "an unrelated output folder" });

		expect(findCloudflareBuildOutput(process.cwd())).toBeUndefined();
	});

	it("ignores a root config path that is a directory", async ({ expect }) => {
		fs.mkdirSync(getRootConfigPath(process.cwd()), { recursive: true });

		expect(findCloudflareBuildOutput(process.cwd())).toBeUndefined();
	});

	it("resolves a project root given as a relative path", async ({ expect }) => {
		await seedBuildOutput(path.resolve("apps/api"));

		expect(findCloudflareBuildOutput(path.join("apps", "api"))).toBe(
			path.resolve("apps/api/.cloudflare/output")
		);
	});

	it("does not report Build Output that belongs to a sibling directory", async ({
		expect,
	}) => {
		await seedBuildOutput(path.resolve("packages/other"));

		expect(findCloudflareBuildOutput(process.cwd())).toBeUndefined();
	});

	it("does not report Build Output from a parent directory", async ({
		expect,
	}) => {
		await seedBuildOutput(process.cwd());
		fs.mkdirSync("nested", { recursive: true });

		expect(findCloudflareBuildOutput(path.resolve("nested"))).toBeUndefined();
	});
});

describe("assertNoCloudflareBuildOutput", () => {
	runInTempDir();

	it("stops with a message naming `cf deploy` and the documentation", async ({
		expect,
	}) => {
		await seedBuildOutput();

		expect(() => assertNoCloudflareBuildOutput(NO_USER_CONFIG, "deploy"))
			.toThrowErrorMatchingInlineSnapshot(`
			[Error: It looks like you've run \`wrangler deploy\` in a project that builds for the Cloudflare CLI (\`cf\`).
			Cloudflare Build Output was found at \`.cloudflare/output\`. Deploying it with Wrangler reads a different configuration, so it may target the wrong Worker.
			Please run \`cf deploy\` instead.
			If that directory is left over from an earlier build, delete it and run \`wrangler deploy\` again.
			See https://developers.cloudflare.com/cf/ for more information.]
		`);
	});

	it("throws a UserError with a telemetry message", async ({ expect }) => {
		await seedBuildOutput();

		const error = captureThrow(() =>
			assertNoCloudflareBuildOutput(NO_USER_CONFIG, "deploy")
		);

		expect(error).toBeInstanceOf(UserError);
		expect((error as UserError).telemetryMessage).toBe(
			"deploy run against cloudflare build output"
		);
	});

	it("names the command that was run", async ({ expect }) => {
		await seedBuildOutput();

		expect(() =>
			assertNoCloudflareBuildOutput(NO_USER_CONFIG, "versions upload")
		).toThrow(/`wrangler versions upload`/);
		expect(
			(
				captureThrow(() =>
					assertNoCloudflareBuildOutput(NO_USER_CONFIG, "versions upload")
				) as UserError
			).telemetryMessage
		).toBe("versions upload run against cloudflare build output");
	});

	it("does nothing for an ordinary Wrangler project", async ({ expect }) => {
		await seed({ "index.js": "export default {};" });

		expect(() =>
			assertNoCloudflareBuildOutput(NO_USER_CONFIG, "deploy")
		).not.toThrow();
	});

	it("inspects the project the configuration selects, not the working directory", async ({
		expect,
	}) => {
		// `--config` can select a project outside the working directory.
		await seedBuildOutput(path.resolve("apps/api"));

		expect(() =>
			assertNoCloudflareBuildOutput(
				selectedConfig(path.join("apps", "api", "wrangler.jsonc")),
				"deploy"
			)
		).toThrow(/apps\/api\/\.cloudflare\/output/);
	});

	it("ignores Build Output in the working directory when the configuration selects another project", async ({
		expect,
	}) => {
		await seedBuildOutput(process.cwd());
		await seed({ "apps/api/wrangler.jsonc": JSON.stringify({ name: "api" }) });

		expect(() =>
			assertNoCloudflareBuildOutput(
				selectedConfig(path.join("apps", "api", "wrangler.jsonc")),
				"deploy"
			)
		).not.toThrow();
	});

	it("falls back to the working directory when there is no configuration file", async ({
		expect,
	}) => {
		await seedBuildOutput(process.cwd());

		expect(() =>
			assertNoCloudflareBuildOutput(NO_USER_CONFIG, "deploy")
		).toThrow(/`\.cloudflare\/output`/);
	});

	it("finds Build Output in a nested project that inherits a parent configuration", async ({
		expect,
	}) => {
		// `cf build` writes Build Output to its own working directory, so a nested
		// project can hold it while the configuration found by searching upwards
		// belongs to the parent.
		await seed({ "wrangler.jsonc": JSON.stringify({ name: "parent" }) });
		fs.mkdirSync("apps/api", { recursive: true });
		const parentConfig = path.resolve("wrangler.jsonc");

		await withCwd("apps/api", async () => {
			await seedBuildOutput(process.cwd());

			expect(() =>
				assertNoCloudflareBuildOutput(inheritedConfig(parentConfig), "deploy")
			).toThrow(/Cloudflare Build Output was found/);
		});
	});

	it("finds Build Output beside an inherited parent configuration", async ({
		expect,
	}) => {
		await seed({ "wrangler.jsonc": JSON.stringify({ name: "parent" }) });
		await seedBuildOutput(process.cwd());
		fs.mkdirSync("apps/api", { recursive: true });
		const parentConfig = path.resolve("wrangler.jsonc");

		await withCwd("apps/api", async () => {
			expect(() =>
				assertNoCloudflareBuildOutput(inheritedConfig(parentConfig), "deploy")
			).toThrow(/Cloudflare Build Output was found/);
		});
	});

	it("ignores Build Output in the launch directory when a script argument selects another project", async ({
		expect,
	}) => {
		// Config discovery starts at the script's directory, so Build Output left
		// in the directory the command was launched from is unrelated.
		await seed({ "api/wrangler.jsonc": JSON.stringify({ name: "api" }) });
		await seedBuildOutput(process.cwd());

		expect(() =>
			assertNoCloudflareBuildOutput(
				scriptArgument(
					path.join("api", "index.js"),
					path.resolve("api/wrangler.jsonc")
				),
				"deploy"
			)
		).not.toThrow();
	});

	it("finds Build Output in the project a script argument selects", async ({
		expect,
	}) => {
		await seed({ "api/wrangler.jsonc": JSON.stringify({ name: "api" }) });
		await seedBuildOutput(path.resolve("api"));

		expect(() =>
			assertNoCloudflareBuildOutput(
				scriptArgument(
					path.join("api", "index.js"),
					path.resolve("api/wrangler.jsonc")
				),
				"deploy"
			)
		).toThrow(/api\/\.cloudflare\/output/);
	});

	it("suggests the `cf` command matching the Wrangler command", async ({
		expect,
	}) => {
		await seedBuildOutput(process.cwd());

		expect(() =>
			assertNoCloudflareBuildOutput(NO_USER_CONFIG, "deploy")
		).toThrow(/`cf deploy`/);
		expect(() =>
			assertNoCloudflareBuildOutput(NO_USER_CONFIG, "versions upload")
		).toThrow(/`cf workers versions create`/);
		expect(() =>
			assertNoCloudflareBuildOutput(NO_USER_CONFIG, "preview")
		).toThrow(/`cf previews deploy`/);
	});

	it("ignores a nested project with no Build Output under an inherited configuration", async ({
		expect,
	}) => {
		await seed({ "wrangler.jsonc": JSON.stringify({ name: "parent" }) });
		fs.mkdirSync("apps/api", { recursive: true });
		const parentConfig = path.resolve("wrangler.jsonc");

		await withCwd("apps/api", async () => {
			expect(() =>
				assertNoCloudflareBuildOutput(inheritedConfig(parentConfig), "deploy")
			).not.toThrow();
		});
	});
});

describe("deployment commands against Cloudflare Build Output", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	const { setIsTTY } = useMockIsTTY();
	const std = mockConsoleMethods();

	beforeEach(() => {
		setIsTTY(true);
		writeWranglerConfig();
		fs.writeFileSync("index.js", "export default {};");
	});

	afterEach(() => {
		clearDialogs();
		clearOutputFilePath();
	});

	it("stops `wrangler deploy` before it uploads", async ({ expect }) => {
		await seedBuildOutput();

		await expect(runWrangler("deploy index.js")).rejects.toThrow(
			/Cloudflare Build Output was found/
		);
	});

	it("stops `wrangler versions upload` before it uploads", async ({
		expect,
	}) => {
		await seedBuildOutput();

		await expect(runWrangler("versions upload index.js")).rejects.toThrow(
			/Cloudflare Build Output was found/
		);
	});

	it("stops `wrangler preview` before it authenticates", async ({ expect }) => {
		await seedBuildOutput();

		await expect(runWrangler("preview index.js")).rejects.toThrow(
			/Cloudflare Build Output was found/
		);
	});

	it("leaves `wrangler deploy --dry-run` alone, because it uploads nothing", async ({
		expect,
	}) => {
		await seedBuildOutput();

		await runWrangler("deploy index.js --dry-run");

		expect(std.err).toBe("");
	});

	it("leaves `wrangler versions upload --dry-run` alone", async ({
		expect,
	}) => {
		await seedBuildOutput();

		await runWrangler("versions upload index.js --dry-run");

		expect(std.err).toBe("");
	});

	it("does not interfere with an ordinary `wrangler deploy --dry-run`", async ({
		expect,
	}) => {
		await runWrangler("deploy index.js --dry-run");

		expect(std.err).toBe("");
	});

	it("stops when `--config` selects a project that has Build Output", async ({
		expect,
	}) => {
		writeWranglerConfig({ main: "index.js" }, "./apps/api/wrangler.jsonc");
		fs.writeFileSync("apps/api/index.js", "export default {};");
		await seedBuildOutput(path.resolve("apps/api"));

		await expect(
			runWrangler("deploy --config apps/api/wrangler.jsonc")
		).rejects.toThrow(/Cloudflare Build Output was found/);
	});

	it("does not stop when only the working directory has Build Output", async ({
		expect,
	}) => {
		// The guard must follow the selected project, so unrelated Build Output
		// beside it cannot block a legitimate deployment.
		//
		// Deliberately not `--dry-run`, which skips the guard and so could not
		// show that the guard allowed this through. The upload is not mocked, so
		// the command still fails — what matters is that it gets past the guard
		// and fails for some other reason.
		writeWranglerConfig({ main: "index.js" }, "./apps/api/wrangler.jsonc");
		fs.writeFileSync("apps/api/index.js", "export default {};");
		await seedBuildOutput(process.cwd());

		const error = await runWrangler(
			"deploy --config apps/api/wrangler.jsonc"
		).then(
			() => undefined,
			(e: unknown) => e
		);

		expect(String(error ?? "")).not.toMatch(/Cloudflare Build Output/);
	});

	it("stops a nested project that inherits a parent configuration", async ({
		expect,
	}) => {
		writeWranglerConfig({ main: "index.js" }, "./wrangler.jsonc");
		fs.mkdirSync("apps/api", { recursive: true });
		fs.writeFileSync("apps/api/index.js", "export default {};");

		await withCwd("apps/api", async () => {
			await seedBuildOutput(process.cwd());

			await expect(runWrangler("deploy index.js")).rejects.toThrow(
				/Cloudflare Build Output was found/
			);
		});
	});
});
