import path from "node:path";
import {
	pushGitFixture,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { fetch } from "undici";
import { afterEach, describe, it, vi } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";
import type { StartDevOptions } from "../../dev";

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

// Startup and reloads have taken over 20 seconds on shared Windows runners.
const READY_TIMEOUT = 45_000;

const eventsWorker = `import { WorkflowEntrypoint } from "cloudflare:workers";
export class OnRepoCreated extends WorkflowEntrypoint {
  async run(event, step) {
    await step.do("record", async () => {
      await this.env.EVENTS.put(event.payload.source.repoName, JSON.stringify(event.payload));
      return "recorded";
    });
  }
}
export default {
  async fetch(request, env) {
    const name = new URL(request.url).pathname.slice(1);
    if (request.method === "POST") return Response.json(await env.REPOS.create(name));
    return new Response(await env.EVENTS.get(name), { status: 200 });
  }
};`;

async function startLocalDev({
	remote = false,
	args = "",
	files,
}: {
	/** `null` omits the setting. */
	remote?: boolean | null;
	args?: string;
	files?: Record<string, string>;
} = {}) {
	await seed(
		files ?? {
			"wrangler.jsonc": JSON.stringify({
				name: "artifacts-local-dev",
				main: "index.js",
				compatibility_date: "2026-09-03",
				artifacts: [
					{
						binding: "REPOS",
						namespace: "examples",
						...(remote === null ? {} : { remote }),
					},
				],
			}),
			"index.js": worker,
		}
	);
	const previousOutput = output.out;
	const stopped = runWrangler(`dev --port=0 --inspector-port=0 ${args}`, {
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
			{ timeout: READY_TIMEOUT }
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

async function stopRunningDev(): Promise<void> {
	await stopDev?.();
	stopDev = undefined;
}

async function request<T>(url: string, endpoint: string): Promise<T> {
	const response = await fetch(url + endpoint);
	if (!response.ok) {
		throw new Error(`Request failed: ${response.status}`);
	}
	return (await response.json()) as T;
}

/** Starting dev twice, a reload and real Git can exceed the default timeout on slow runners. */
const ARTIFACTS_DEV_TEST_TIMEOUT = 150_000;

async function createAndPushDemo(url: string): Promise<Created> {
	const created = await request<Created>(url, "/create");
	await pushGitFixture({
		directory: path.resolve("git-fixture"),
		remote: created.remote,
		token: created.token,
		files: { "hello.txt": "hello artifacts\n" },
	});
	return created;
}

describe("Wrangler dev local Artifacts", { concurrent: false }, () => {
	runInTempDir();

	afterEach(async () => {
		await stopRunningDev();
	});

	it(
		"creates, pushes and reads across a reload with remote=false",
		{ timeout: ARTIFACTS_DEV_TEST_TIMEOUT },
		async ({ expect }) => {
			const dev = await startLocalDev();
			try {
				const created = await createAndPushDemo(dev.url);
				expect(new URL(created.remote).hostname).toBe("127.0.0.1");
				expect(await (await fetch(dev.url + "/file")).text()).toBe(
					"hello artifacts\n"
				);
				expect(
					(await request<{ repos: unknown[] }>(dev.url, "/list")).repos
				).toHaveLength(1);
				await seed({ "index.js": worker.replace("initial", "reloaded") });
				await vi.waitFor(
					async () => {
						expect(await (await fetch(dev.url + "/version")).text()).toBe(
							"reloaded"
						);
					},
					{ timeout: READY_TIMEOUT }
				);
				expect(await (await fetch(dev.url + "/file")).text()).toBe(
					"hello artifacts\n"
				);
			} finally {
				await stopRunningDev();
				await dev.stopped;
			}
		}
	);

	it(
		"keeps repositories across restarts with remote=false",
		{ timeout: ARTIFACTS_DEV_TEST_TIMEOUT },
		async ({ expect }) => {
			const first = await startLocalDev();
			let gitUrl: string;
			try {
				gitUrl = (await createAndPushDemo(first.url)).remote;
			} finally {
				await stopRunningDev();
				await first.stopped;
			}
			await expect(
				fetch(gitUrl + "/info/refs?service=git-upload-pack")
			).rejects.toThrow();
			const second = await startLocalDev();
			try {
				expect(
					(await request<{ name: string }>(second.url, "/info")).name
				).toBe("demo");
				expect(await (await fetch(second.url + "/file")).text()).toBe(
					"hello artifacts\n"
				);
			} finally {
				await stopRunningDev();
				await second.stopped;
			}
		}
	);

	it.for([
		{ remote: null, args: "" },
		{ remote: null, args: "--local" },
		{ remote: true, args: "--local" },
	])(
		"uses the local simulator for remote=$remote with args '$args'",
		{ timeout: ARTIFACTS_DEV_TEST_TIMEOUT },
		async ({ remote, args }, { expect }) => {
			const dev = await startLocalDev({ remote, args });
			try {
				expect(output.out).toMatch(
					/env\.REPOS \(examples\)\s+Artifacts\s+local/
				);
				expect(
					(await request<{ repos: unknown[] }>(dev.url, "/list")).repos
				).toEqual([]);
				const defaultWarning =
					"Artifacts binding REPOS uses the local simulator by default. Set `remote: true` to use deployed repos, or `remote: false` to silence this warning.";
				// `--local` always used the simulator, so only the default warns.
				if (remote === null && args === "") {
					expect(output.warn).toContain(defaultWarning);
				} else {
					expect(output.warn).not.toContain(defaultWarning);
				}
			} finally {
				await stopRunningDev();
				await dev.stopped;
			}
		}
	);

	it.for(["binding", "export"] as const)(
		"starts a Workflow %s from Artifacts triggers.events",
		async (mode, { expect }) => {
			const dev = await startLocalDev({
				files: {
					"wrangler.jsonc": JSON.stringify({
						name: "artifacts-local-events",
						main: "index.js",
						compatibility_date: "2026-09-03",
						artifacts: [
							{ binding: "REPOS", namespace: "examples", remote: false },
						],
						kv_namespaces: [{ binding: "EVENTS", id: "events" }],
						...(mode === "binding"
							? {
									workflows: [
										{
											binding: "ON_REPO_CREATED",
											name: "on-repo-created",
											class_name: "OnRepoCreated",
										},
									],
								}
							: {
									exports: {
										OnRepoCreated: {
											type: "workflow",
											name: "on-repo-created",
										},
									},
								}),
						triggers: {
							events: [
								{
									type: "cf.artifacts.repo.created",
									filter: { namespace: "examples", repo_name: "demo" },
									targets: [
										{ type: "workflow", workflow_name: "on-repo-created" },
									],
								},
							],
						},
					}),
					"index.js": eventsWorker,
				},
			});
			try {
				await fetch(dev.url + "/ignored", { method: "POST" });
				await fetch(dev.url + "/demo", { method: "POST" });
				await vi.waitFor(
					async () => {
						expect(await (await fetch(dev.url + "/demo")).json()).toMatchObject(
							{
								type: "cf.artifacts.repo.created",
								source: {
									type: "artifacts",
									namespace: "examples",
									repoName: "demo",
								},
								payload: { defaultBranch: "main" },
							}
						);
					},
					{ timeout: 15_000 }
				);
				expect(await (await fetch(dev.url + "/ignored")).text()).toBe("");
			} finally {
				await stopRunningDev();
				await dev.stopped;
			}
		}
	);
});
