import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { runInTempDir, seed } from "@cloudflare/workers-utils/test-helpers";
import { fetch } from "undici";
import { afterEach, describe, it, vi } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";
import type { StartDevOptions } from "../../dev";

const git = promisify(execFile);
let stopDev: (() => Promise<void>) | undefined;
vi.mock("../../dev/start-dev", async () => {
	const actual = await vi.importActual<typeof import("../../dev/start-dev")>(
		"../../dev/start-dev"
	);
	return {
		...actual,
		async startDev(options: StartDevOptions) {
			const result = await actual.startDev(options);
			stopDev = () => result.devEnv.teardown();
			return result;
		},
	};
});

const worker = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/version") return new Response("initial");
    if (url.pathname === "/create") return Response.json(await env.REPOS.create("demo"));
    if (url.pathname === "/list") return Response.json(await env.REPOS.list());
    const repo = await env.REPOS.get("demo");
    if (url.pathname === "/file") {
      const file = await repo.readFile({ ref: "main", path: "hello.txt" });
      return new Response(file ?? "missing", { status: file ? 200 : 404 });
    }
    return Response.json(await repo.info());
  }
};`;

type Created = { remote: string; token: string };

async function startLocalDev(remote?: false) {
	await seed({
		"wrangler.jsonc": JSON.stringify({
			name: "artifacts-local-dev",
			main: "index.js",
			compatibility_date: "2026-09-03",
			artifacts: [
				{
					binding: "REPOS",
					namespace: "examples",
					...(remote === undefined ? {} : { remote }),
				},
			],
		}),
		"index.js": worker,
	});
	const previousOutput = output.out;
	const stopped = runWrangler("dev --port=0 --inspector-port=0", {
		WRANGLER_CI_DISABLE_CONFIG_WATCHING: "false",
		CLOUDFLARE_API_TOKEN: undefined,
		CLOUDFLARE_ACCOUNT_ID: undefined,
	});

	const match = await Promise.race([
		vi.waitUntil(
			() =>
				output.out
					.slice(previousOutput.length)
					.match(/Ready on (?<url>http:\/\/[^:]+:\d+)/),
			{ timeout: 15_000 }
		),
		stopped.then(() => {
			throw new Error("Wrangler dev exited before ready");
		}),
	]).catch((error: unknown) => {
		throw new Error(
			`Wrangler did not become ready: ${output.out}\n${output.err}`,
			{ cause: error }
		);
	});
	const url = match?.groups?.url;
	if (!url) {
		throw new Error(`No local dev URL: ${output.out}`);
	}
	return { url, stopped };
}

const output = mockConsoleMethods();

async function request<T>(url: string, endpoint: string): Promise<T> {
	const response = await fetch(url + endpoint);
	if (!response.ok) {
		throw new Error(`Request failed: ${response.status}`);
	}
	return (await response.json()) as T;
}

describe.sequential("Wrangler dev local Artifacts", () => {
	runInTempDir();

	afterEach(async () => {
		await stopDev?.();
		stopDev = undefined;
		vi.unstubAllEnvs();
	});

	it.for([undefined, false] as const)(
		"creates, pushes, reads and survives reload (remote=%s)",
		async (remote, { expect }) => {
			const first = await startLocalDev(remote);
			let gitUrl = "";
			try {
				const created = await request<Created>(first.url, "/create");
				gitUrl = created.remote;
				expect(new URL(created.remote).hostname).toBe("127.0.0.1");
				const directory = path.resolve("git-fixture");
				await git("git", ["init", "--initial-branch=main", directory]);
				await writeFile(path.join(directory, "hello.txt"), "hello artifacts\n");
				const env = {
					...process.env,
					GIT_AUTHOR_NAME: "Example",
					GIT_AUTHOR_EMAIL: "example@example.invalid",
					GIT_COMMITTER_NAME: "Example",
					GIT_COMMITTER_EMAIL: "example@example.invalid",
					GIT_CONFIG_NOSYSTEM: "1",
					GIT_CONFIG_GLOBAL: "/dev/null",
				};
				await git("git", ["add", "hello.txt"], { cwd: directory, env });
				await git("git", ["commit", "-m", "fixture"], { cwd: directory, env });
				await git(
					"git",
					[
						"-c",
						`http.extraHeader=Authorization: Bearer ${created.token}`,
						"push",
						created.remote,
						"main",
					],
					{ cwd: directory, env }
				);
				expect(await (await fetch(first.url + "/file")).text()).toBe(
					"hello artifacts\n"
				);
				expect(
					(await request<{ repos: unknown[] }>(first.url, "/list")).repos
				).toHaveLength(1);
				await seed({ "index.js": worker.replace("initial", "reloaded") });
				await vi.waitFor(
					async () => {
						expect(await (await fetch(first.url + "/version")).text()).toBe(
							"reloaded"
						);
					},
					{ timeout: 15_000 }
				);
				expect(await (await fetch(first.url + "/file")).text()).toBe(
					"hello artifacts\n"
				);
			} finally {
				await stopDev?.();
				stopDev = undefined;
				await first.stopped;
			}
			await expect(
				fetch(gitUrl + "/info/refs?service=git-upload-pack")
			).rejects.toThrow();
			const second = await startLocalDev(remote);
			try {
				expect(
					(await request<{ name: string }>(second.url, "/info")).name
				).toBe("demo");
				expect(await (await fetch(second.url + "/file")).text()).toBe(
					"hello artifacts\n"
				);
			} finally {
				await stopDev?.();
				stopDev = undefined;
				await second.stopped;
			}
		}
	);
});
