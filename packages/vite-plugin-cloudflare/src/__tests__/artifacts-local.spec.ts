import * as fs from "node:fs";
import * as path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { pushGitFixture } from "@cloudflare/workers-utils/test-helpers";
import { createServer } from "vite";
import { afterEach, test, vi } from "vitest";

// Excluded from type checking, so a crashed run cannot leave a stray
// `cloudflare.config.ts` in the plugin sources. A temp directory does not
// work on Windows: Vite cannot load the entry from 8.3 paths like RUNNER~1.
const FIXTURES_ROOT = path.resolve(__dirname, "fixtures", "artifacts-local");

const CONFIG = `import { bindings, defineConfig } from "@cloudflare/config";

export default defineConfig({
	worker: {
		name: "vite-artifacts-local",
		entrypoint: "./index.js",
		compatibilityDate: "2026-09-03",
		env: {
			REPOS: bindings.artifacts({
				namespace: "examples",
				dev: { remote: false },
			}),
		},
	},
});
`;

const WORKER = `export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/create") return Response.json(await env.REPOS.create("demo"));
    if (pathname === "/list") return Response.json(await env.REPOS.list());
    const repo = await env.REPOS.get("demo");
    if (pathname === "/file") {
      const file = await repo.readFile({ ref: "main", path: "hello.txt" });
      return new Response(file ?? "missing", { status: file ? 200 : 404 });
    }
    return Response.json(await repo.info());
  }
};`;

function createFixture(): string {
	fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
	const root = fs.realpathSync(
		fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-"))
	);
	fs.writeFileSync(
		path.join(root, "package.json"),
		JSON.stringify({ type: "module" })
	);
	fs.writeFileSync(path.join(root, "cloudflare.config.ts"), CONFIG);
	fs.writeFileSync(path.join(root, "index.js"), WORKER);
	return root;
}

afterEach(() => vi.unstubAllEnvs());

test("Vite dev serves local Artifacts with explicit remote=false", async ({
	expect,
	onTestFinished,
}) => {
	vi.stubEnv("CLOUDFLARE_API_TOKEN", undefined);
	vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);
	const root = createFixture();
	onTestFinished(() => removeDirSync(root));
	const server = await createServer({
		root,
		configFile: false,
		logLevel: "silent",
		server: { port: 0 },
		plugins: [cloudflare({ inspectorPort: false, persistState: false })],
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
		await pushGitFixture({
			directory: path.join(root, "git-fixture"),
			remote: created.remote,
			token: created.token,
			files: { "hello.txt": "hello artifacts\n" },
		});
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
	await expect(
		fetch(gitUrl + "/info/refs?service=git-upload-pack")
	).rejects.toThrow();
});
