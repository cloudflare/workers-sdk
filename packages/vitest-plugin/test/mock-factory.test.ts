import childProcess from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { overrideConfigEnv } from "@cloudflare/mock-npm-registry";
import { removeDir } from "@cloudflare/workers-utils";
import { stripAnsi } from "miniflare";
import dedent from "ts-dedent";
import { test } from "vitest";
import { version } from "../package.json";

// Vitest 5.1.0's mock manager clears its `AsyncLocalStorage` of pending mock
// factory contexts with `disable()` once no factories remain:
// https://github.com/vitest-dev/vitest/blob/v5.1.0/packages/vitest/src/runtime/mocker.ts
// `workerd` intentionally does not implement `AsyncLocalStorage.disable()`,
// which used to make every `vi.mock` module factory reject with
// `asyncLocalStorage.disable() is not implemented` before its tests ran.
// See https://github.com/cloudflare/workers-sdk/issues/16668
test(
	"mock factories resolve with a module mock on the latest Vitest 5 release",
	{ timeout: 300_000, retry: 0 },
async ({ expect }) => {
		// The shared test project installed by `global-setup.ts` pins Vitest to
		// the repository's catalog version, so create a separate project
		// installing the latest published Vitest 5 release instead. Everything
		// else about the setup matches the other tests: `@cloudflare/vitest-plugin`
		// is resolved from the mock registry and Vitest from the public registry
		// via its uplink.
		const projectPath = await fs.realpath(
			await fs.mkdtemp(path.join(os.tmpdir(), "vitest-plugin mock-"))
		);
		try {
			await fs.writeFile(
				path.join(projectPath, "package.json"),
				JSON.stringify(
					{
						name: "vitest-plugin-mock-repro",
						private: true,
						type: "module",
						devDependencies: {
							"@cloudflare/vitest-plugin": version,
							vite: "8.3.5",
							// The first Vitest 5 release that calls
							// `AsyncLocalStorage.disable()` in its mock manager.
							vitest: "5.1.0",
						},
					},
					null,
					"\t"
				)
			);
			// pnpm blocks lifecycle scripts by default. The transitive deps
			// (workerd, esbuild) need their postinstall to download platform
			// binaries. Same as `global-setup.ts`.
			await fs.writeFile(
				path.join(projectPath, "pnpm-workspace.yaml"),
				["packages:", '  - "."', "allowBuilds:", "  esbuild: true", "  workerd: true", ""].join(
					"\n"
				)
			);
			await seed(projectPath, {
				"vitest.config.ts": dedent /* javascript */ `
					import { cloudflareTest } from "@cloudflare/vitest-plugin";
					import { defineConfig } from "vitest/config";

					export default defineConfig({
						plugins: [
							cloudflareTest({
								miniflare: {
									compatibilityDate: "2026-11-02",
									compatibilityFlags: ["nodejs_compat"],
								},
							}),
						],
					});
				`,
				"greeting.ts": dedent /* javascript */ `
					export function greeting() {
						return "hello";
					}
				`,
				"control.test.ts": dedent /* javascript */ `
					import { expect, test } from "vitest";
					import { greeting } from "./greeting";

					test("loads the original module without a mock", () => {
						expect(greeting()).toBe("hello");
					});
				`,
				"mock.test.ts": dedent /* javascript */ `
					import { expect, test, vi } from "vitest";
					import { greeting } from "./greeting";

					vi.mock(import("./greeting"), async (importOriginal) => ({
						...(await importOriginal()),
						greeting: () => "mocked",
					}));

					test("uses the mocked module", () => {
						expect(greeting()).toBe("mocked");
					});
				`,
			});

			// `vitest@5.1.0` may have been published more recently than the
			// repository's `minimumReleaseAge` cooldown, which is inherited from
			// the parent `pnpm run` environment, so lift it for this install only.
			const { env } = overrideConfigEnv(process.env, {
				"minimum-release-age": "0",
			});

			const install = execToString("pnpm install", projectPath, env);
			if (!install.ok) {
				throw new Error(`pnpm install failed:\n${install.output}`);
			}

			const run = execToString("pnpm exec vitest run", projectPath, env);
			expect(run.output).not.toMatch(
				"asyncLocalStorage.disable() is not implemented"
			);
			if (!run.ok) {
				throw new Error(`vitest run failed:\n${run.output}`);
			}
			expect(run.output).toMatch(/Test Files\s+2 passed/);
		} finally {
			await removeDir(projectPath);
		}
	}
);

/** Write the given files, creating intermediate directories as needed. */
async function seed(root: string, files: Record<string, string>) {
	for (const [name, contents] of Object.entries(files)) {
		const filePath = path.resolve(root, name);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, contents);
	}
}

/**
 * Run a command, capturing its combined output regardless of exit code.
 */
function execToString(
	command: string,
	cwd: string,
	env: NodeJS.ProcessEnv
): { ok: boolean; output: string } {
	try {
		// eslint-disable-next-line workers-sdk/no-unsafe-command-execution -- test helper
		const stdout = childProcess.execSync(command, {
			cwd,
			env,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		return { ok: true, output: stripAnsi(stdout) };
	} catch (error) {
		const { stdout, stderr } = error as {
			stdout?: string;
			stderr?: string;
		};
		return { ok: false, output: stripAnsi(`${stdout ?? ""}${stderr ?? ""}`) };
	}
}
