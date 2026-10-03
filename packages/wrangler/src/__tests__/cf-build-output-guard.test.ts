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

		expect(() => assertNoCloudflareBuildOutput(process.cwd(), "deploy"))
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
			assertNoCloudflareBuildOutput(process.cwd(), "deploy")
		);

		expect(error).toBeInstanceOf(UserError);
		expect((error as UserError).telemetryMessage).toBe(
			"deploy run against cloudflare build output"
		);
	});

	it("names the command that was run", async ({ expect }) => {
		await seedBuildOutput();

		expect(() =>
			assertNoCloudflareBuildOutput(process.cwd(), "versions upload")
		).toThrow(/`wrangler versions upload`/);
		expect(
			(
				captureThrow(() =>
					assertNoCloudflareBuildOutput(process.cwd(), "versions upload")
				) as UserError
			).telemetryMessage
		).toBe("versions upload run against cloudflare build output");
	});

	it("does nothing for an ordinary Wrangler project", async ({ expect }) => {
		await seed({ "index.js": "export default {};" });

		expect(() =>
			assertNoCloudflareBuildOutput(process.cwd(), "deploy")
		).not.toThrow();
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
});
