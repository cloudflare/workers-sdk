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

async function startLocalDev({
	remote = false,
	args = "",
}: {
	/** `null` omits the setting. */
	remote?: boolean | null;
	args?: string;
} = {}) {
	await seed({
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
	});
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
const ARTIFACTS_DEV_TEST_TIMEOUT = 90_000;

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
					{ timeout: 15_000 }
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

	it("uses the local simulator for omitted remote with --local", async ({
		expect,
	}) => {
		const dev = await startLocalDev({ remote: null, args: "--local" });
		try {
			expect(output.out).toMatch(/env\.REPOS \(examples\)\s+Artifacts\s+local/);
			expect(
				(await request<{ repos: unknown[] }>(dev.url, "/list")).repos
			).toEqual([]);
			expect(output.warn).not.toContain("uses the deployed resource");
		} finally {
			await stopRunningDev();
			await dev.stopped;
		}
	});
});
