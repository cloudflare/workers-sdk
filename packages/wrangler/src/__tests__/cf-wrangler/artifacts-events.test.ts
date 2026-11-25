import path from "node:path";
import {
	pushGitFixture,
	runFixtureGit,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { fetch } from "undici";
import { afterEach, describe, it, vi } from "vitest";
import { parseArgs as parseCfWranglerArgs } from "../../cf-wrangler/args";
import { runCfWranglerDev } from "../../cf-wrangler/dev";
import { mockConsoleMethods } from "../helpers/mock-console";
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

// Vitest cannot run @cloudflare/config's TypeScript loader; load seeded files directly.
vi.mock("@cloudflare/config", async (importOriginal) => {
	const { createConfigMock } = await import("../helpers/mock-new-config");
	return createConfigMock(importOriginal);
});

type Created = { remote: string; token: string };

// Startup has taken over 20 seconds on shared Windows runners.
const READY_TIMEOUT = 45_000;
/** Starting dev and real Git can exceed the default timeout on slow runners. */
const ARTIFACTS_DEV_TEST_TIMEOUT = 150_000;

/** Records each event under `<type>:<repoName>`; GET / lists what was recorded. */
const gitEventsWorker = `import { WorkflowEntrypoint } from "cloudflare:workers";
export class RecordRepoEvent extends WorkflowEntrypoint {
  async run(event, step) {
    await step.do("record", async () => {
      const { type, source } = event.payload;
      await this.env.EVENTS.put(type + ":" + source.repoName, JSON.stringify(event.payload));
      return "recorded";
    });
  }
}
export default {
  async fetch(request, env) {
    const name = new URL(request.url).pathname.slice(1);
    if (request.method === "POST") return Response.json(await env.REPOS.create(name));
    const { keys } = await env.EVENTS.list();
    return Response.json(keys.map(({ name }) => name).sort());
  }
};`;

describe(
	"cf-wrangler dev local Artifacts events",
	{ concurrent: false },
	() => {
		runInTempDir();
		mockConsoleMethods();

		afterEach(async () => {
			await stopDev?.();
			stopDev = undefined;
		});

		it(
			"cf-wrangler dev starts Workflows from cloudflare.config.ts Git events",
			{ timeout: ARTIFACTS_DEV_TEST_TIMEOUT },
			async ({ expect }) => {
				vi.stubEnv("CLOUDFLARE_API_TOKEN", undefined);
				vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);
				await seed({
					// `cf dev` runs this entrypoint for Wrangler projects.
					"cloudflare.config.ts": `export default { worker: {
					name: "cf-artifacts-git-events",
					entrypoint: "./index.js",
					compatibilityDate: "2026-09-03",
					env: {
						REPOS: { type: "artifacts", namespace: "examples", dev: { remote: false } },
						EVENTS: { type: "kv" },
					},
					exports: {
						RecordRepoEvent: {
							type: "workflow",
							name: "record-git-events",
							events: [
								{ type: "cf.artifacts.repo.pushed", filter: { namespace: "examples", repoName: "demo" } },
								{ type: "cf.artifacts.repo.cloned" },
								{ type: "cf.artifacts.repo.fetched" },
							],
						},
					},
				} };`,
					"wrangler.config.ts": `export default { types: { generate: false } };`,
					"index.js": gitEventsWorker,
				});
				let url: string | undefined;
				// Parse arguments as the cf-wrangler binary does; it always enables
				// the cloudflare.config.ts loader.
				const running = runCfWranglerDev({
					...parseCfWranglerArgs(["--port=0", "--inspector-port=0"]),
					showInteractiveDevSession: false,
					onReady: (ip: string, port: number) => {
						url = `http://${ip}:${port}`;
					},
				});
				try {
					await vi.waitUntil(() => url, { timeout: READY_TIMEOUT });
					const base = url as string;
					const created: Record<string, Created> = {};
					for (const name of ["ignored", "demo"]) {
						created[name] = (await (
							await fetch(`${base}/${name}`, { method: "POST" })
						).json()) as Created;
						await pushGitFixture({
							directory: path.resolve(`git-${name}`),
							remote: created[name].remote,
							token: created[name].token,
							files: { "hello.txt": "hello artifacts\n" },
						});
					}
					const demo = created.demo as Created;
					const git = (cwd: string, ...args: string[]) =>
						runFixtureGit({ cwd: path.resolve(cwd), token: demo.token, args });
					await git(".", "clone", demo.remote, "git-clone");
					// A fetch only negotiates when there is something new to fetch.
					await git("git-demo", "commit", "--allow-empty", "-m", "second");
					await git("git-demo", "push", demo.remote, "main");
					await git("git-clone", "fetch", "origin");

					await vi.waitFor(
						async () => {
							expect(await (await fetch(base)).json()).toEqual([
								"cf.artifacts.repo.cloned:demo",
								"cf.artifacts.repo.fetched:demo",
								"cf.artifacts.repo.pushed:demo",
							]);
						},
						{ timeout: 15_000 }
					);
				} finally {
					await stopDev?.();
					stopDev = undefined;
					await expect(running).resolves.toBe(0);
				}
			}
		);
	}
);
