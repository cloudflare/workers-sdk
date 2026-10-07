import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { createServer } from "vite";
import { afterEach, test, vi } from "vitest";
import { cloudflare } from "../index";

vi.mock("node:fs", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs")>();
	const { fileURLToPath } = await import("node:url");
	const source = fileURLToPath(new URL("../workers/", import.meta.url));
	const built = fileURLToPath(new URL("../../dist/workers/", import.meta.url));
	return {
		...original,
		readFileSync(
			file: Parameters<typeof original.readFileSync>[0],
			options: Parameters<typeof original.readFileSync>[1]
		) {
			if (
				typeof file === "string" &&
				file.startsWith(source) &&
				file.endsWith(".js")
			) {
				file = built + file.slice(source.length);
			}
			return original.readFileSync(file, options);
		},
	};
});

const git = promisify(execFile);

runInTempDir();
afterEach(() => vi.unstubAllEnvs());

test.for([undefined, false] as const)(
	"Vite dev serves local Artifacts without credentials (remote=%s)",
	async (remote, { expect, onTestFinished }) => {
		vi.stubEnv("CLOUDFLARE_API_TOKEN", undefined);
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);
		// On Windows, the system temp directory can use an 8.3 path (RUNNER~1).
		// Vite resolves that entry as /index.js, but cannot load it from the
		// virtual Worker module. Keep the fixture under the checkout instead.
		const fixtureDir = fs.mkdtempSync(
			path.join(
				fs.realpathSync(path.dirname(fileURLToPath(import.meta.url))),
				"artifacts-local-"
			)
		);
		onTestFinished(() =>
			fs.rmSync(fixtureDir, { recursive: true, force: true, maxRetries: 10 })
		);
		fs.writeFileSync(
			path.join(fixtureDir, "package.json"),
			JSON.stringify({ type: "module" })
		);
		fs.writeFileSync(
			path.join(fixtureDir, "wrangler.jsonc"),
			JSON.stringify({
				name: "vite-artifacts-local",
				main: "index.js",
				compatibility_date: "2026-09-03",
				artifacts: [
					{
						binding: "REPOS",
						namespace: "examples",
						...(remote === undefined ? {} : { remote }),
					},
				],
			})
		);
		fs.writeFileSync(
			path.join(fixtureDir, "index.js"),
			`export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/create") return Response.json(await env.REPOS.create("demo"));
    if (new URL(request.url).pathname === "/list") return Response.json(await env.REPOS.list());
    const repo = await env.REPOS.get("demo");
    if (new URL(request.url).pathname === "/file") {
      const file = await repo.readFile({ ref: "main", path: "hello.txt" });
      return new Response(file ?? "missing", { status: file ? 200 : 404 });
    }
    return Response.json(await repo.info());
  }
};`
		);
		const server = await createServer({
			root: fixtureDir,
			configFile: false,
			logLevel: "silent",
			server: { port: 0 },
			plugins: [
				cloudflare({
					configPath: path.join(fixtureDir, "wrangler.jsonc"),
					inspectorPort: false,
					persistState: false,
				}),
			],
		});
		let gitUrl: string | undefined;
		try {
			await server.listen();
			const url = server.resolvedUrls?.local[0];
			if (!url) {
				throw new Error("Vite server did not provide a local URL");
			}
			const created = (await (await fetch(new URL("create", url))).json()) as {
				remote: string;
				token: string;
			};
			gitUrl = created.remote;
			expect(new URL(gitUrl).hostname).toBe("127.0.0.1");
			const directory = path.join(fixtureDir, "git-fixture");
			await git("git", ["init", "--initial-branch=main", directory]);
			fs.writeFileSync(path.join(directory, "hello.txt"), "hello artifacts\n");
			// Avoid inheriting host Git credentials or Cloudflare environment.
			const inherited = Object.fromEntries(
				[
					"PATH",
					"SystemRoot",
					"WINDIR",
					"PATHEXT",
					"TMP",
					"TEMP",
					"TMPDIR",
					"LANG",
				].map((key) => [key, process.env[key]])
			);
			const gitOptions = {
				cwd: directory,
				env: {
					...inherited,
					GIT_AUTHOR_NAME: "Example",
					GIT_AUTHOR_EMAIL: "example@example.invalid",
					GIT_COMMITTER_NAME: "Example",
					GIT_COMMITTER_EMAIL: "example@example.invalid",
					GIT_CONFIG_NOSYSTEM: "1",
					GIT_CONFIG_GLOBAL: path.join(directory, "absent-global-gitconfig"),
					GIT_CONFIG_COUNT: "1",
					GIT_CONFIG_KEY_0: "credential.helper",
					GIT_CONFIG_VALUE_0: "",
					GIT_TERMINAL_PROMPT: "0",
				},
			};
			await git("git", ["add", "hello.txt"], gitOptions);
			await git("git", ["commit", "-m", "fixture"], gitOptions);
			await git(
				"git",
				[
					"-c",
					`http.extraHeader=Authorization: Bearer ${created.token}`,
					"push",
					gitUrl,
					"main",
				],
				gitOptions
			);
			expect(await (await fetch(new URL("file", url))).text()).toBe(
				"hello artifacts\n"
			);
			const listed = (await (await fetch(new URL("list", url))).json()) as {
				repos: unknown[];
			};
			expect(listed.repos).toHaveLength(1);
			const info = (await (await fetch(new URL("info", url))).json()) as {
				name: string;
			};
			expect(info.name).toBe("demo");
		} finally {
			await server.close();
		}
		if (gitUrl) {
			await expect(
				fetch(gitUrl + "/info/refs?service=git-upload-pack")
			).rejects.toThrow();
		}
	}
);
