import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { CorePaths } from "../../../src/workers/core/constants";
import {
	zArtifactsNamespacesGetResponse,
	zArtifactsNamespacesListResponse,
	zArtifactsRepoTokensListResponse,
	zArtifactsReposCreateResponse,
	zArtifactsReposDeleteResponse,
	zArtifactsReposForkResponse,
	zArtifactsReposGetResponse,
	zArtifactsReposListResponse,
	zArtifactsTokensCreateResponse,
	zArtifactsTokensRevokeResponse,
} from "../../../src/workers/local-explorer/generated/zod.gen";
import {
	disposeWithRetry,
	singleModuleManifest,
	useDispose,
	useTmp,
} from "../../test-shared";
import { createUnboundStorageExplorer, expectValidResponse } from "./helpers";

const exec = promisify(execFile);
const API = `http://localhost${CorePaths.EXPLORER}/api/artifacts/namespaces`;

const DEV_SCRIPT = `
export default {
	async fetch(request, env) {
		const { method, name } = await request.json();
		if (method === "list") return Response.json(await env.ARTIFACTS.list());
		if (method === "create") return Response.json(await env.ARTIFACTS.create(name));
		const repo = await env.ARTIFACTS.get(name);
		return Response.json(await repo.info());
	}
};
`;

/** Starts Miniflare the way `cf --local` does: shared storage, no bindings. */
async function startCfLocal(
	resourcePersistencePath: string
): Promise<Miniflare> {
	const mf = new Miniflare({
		inspectorPort: 0,
		cf: false,
		unsafeLocalExplorer: true,
		unsafeEnableSharedStorage: true,
		resourcePersistencePath,
		isolatedResourcePersistencePath: await useTmp(),
		unsafeDevRegistryPath: await useTmp(),
		workers: [
			{
				config: {
					name: "cf-local",
					compatibilityDate: "2026-08-15",
					manifest: singleModuleManifest(
						`export default { fetch() { return new Response(null, { status: 404 }); } }`
					),
				},
			},
		],
	});
	await mf.ready;
	return mf;
}

/** Starts Miniflare the way `wrangler dev` does, with an Artifacts binding. */
async function startDev(
	resourcePersistencePath: string,
	namespace = "default"
): Promise<Miniflare> {
	const mf = new Miniflare({
		inspectorPort: 0,
		cf: false,
		unsafeLocalExplorer: true,
		resourcePersistencePath,
		workers: [
			{
				config: {
					name: "app",
					compatibilityDate: "2026-09-03",
					env: {
						ARTIFACTS: {
							type: "artifacts",
							namespace,
							dev: { remote: false },
						},
					},
					manifest: singleModuleManifest(DEV_SCRIPT),
				},
			},
		],
	});
	await mf.ready;
	return mf;
}

async function callBinding<T>(
	mf: Miniflare,
	method: "list" | "create" | "info",
	name?: string
): Promise<T> {
	const response = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({ method, name }),
	});
	return (await response.json()) as T;
}

function api(
	mf: Miniflare,
	pathname: string,
	method = "GET",
	body?: unknown
): Promise<Response> {
	return mf.dispatchFetch(`${API}${pathname}`, {
		method,
		...(body === undefined
			? {}
			: {
					body: JSON.stringify(body),
					headers: { "Content-Type": "application/json" },
				}),
	});
}

async function errorOf(
	response: Response
): Promise<{ status: number; code: number; pointer?: string }> {
	const body = (await response.json()) as {
		success: boolean;
		errors: { code: number; source?: { pointer: string } }[];
	};
	return {
		status: response.status,
		code: body.errors[0]?.code,
		...(body.errors[0]?.source
			? { pointer: body.errors[0].source.pointer }
			: {}),
	};
}

describe("Artifacts API with `cf --local` options", () => {
	test("manages repositories in `default` from an empty state directory", async ({
		expect,
	}) => {
		const mf = await startCfLocal(await useTmp());
		useDispose(mf);

		const created = await expectValidResponse(
			await api(mf, "/default/repos", "POST", {
				name: "demo",
				description: "Demo",
			}),
			zArtifactsReposCreateResponse,
			expect,
			201
		);
		expect(created.result).toMatchObject({
			name: "demo",
			description: "Demo",
			default_branch: "main",
			remote: expect.stringMatching(
				/^http:\/\/127\.0\.0\.1:\d+\/git\/default\/demo\.git$/
			),
			token: expect.stringMatching(/^art_v2_/),
		});
		expect(
			await errorOf(await api(mf, "/default/repos", "POST", { name: "demo" }))
		).toEqual({
			status: 409,
			code: 10201,
		});

		const repo = await expectValidResponse(
			await api(mf, "/default/repos/demo"),
			zArtifactsReposGetResponse,
			expect
		);
		expect(repo.result).toMatchObject({
			id: created.result.id,
			name: "demo",
			read_only: false,
			source: null,
			last_push_at: null,
			remote: created.result.remote,
		});

		const fork = await expectValidResponse(
			await api(mf, "/default/repos/demo/fork", "POST", {
				name: "demo-fork",
				read_only: true,
			}),
			zArtifactsReposForkResponse,
			expect,
			201
		);
		expect(fork.result).toMatchObject({ name: "demo-fork", objects: 0 });
		expect(
			(
				await expectValidResponse(
					await api(mf, "/default/repos/demo-fork"),
					zArtifactsReposGetResponse,
					expect
				)
			).result
		).toMatchObject({ read_only: true, source: "artifacts:default/demo" });

		const list = await expectValidResponse(
			await api(mf, "/default/repos?sort=name&direction=asc"),
			zArtifactsReposListResponse,
			expect
		);
		expect(list.result.map(({ name }) => name)).toEqual(["demo", "demo-fork"]);
		expect(list.result_info).toMatchObject({ count: 2, total_count: 2 });
		const page = await expectValidResponse(
			await api(mf, "/default/repos?limit=1&sort=name&direction=asc"),
			zArtifactsReposListResponse,
			expect
		);
		expect(page.result.map(({ name }) => name)).toEqual(["demo"]);
		const cursor = (page.result_info as { cursor: string }).cursor;
		const next = await expectValidResponse(
			await api(
				mf,
				`/default/repos?limit=1&sort=name&direction=asc&cursor=${encodeURIComponent(cursor)}`
			),
			zArtifactsReposListResponse,
			expect
		);
		expect(next.result.map(({ name }) => name)).toEqual(["demo-fork"]);
		const search = await expectValidResponse(
			await api(mf, "/default/repos?search=FORK"),
			zArtifactsReposListResponse,
			expect
		);
		expect(search.result.map(({ name }) => name)).toEqual(["demo-fork"]);

		const namespaces = await expectValidResponse(
			await api(mf, ""),
			zArtifactsNamespacesListResponse,
			expect
		);
		expect(namespaces.result).toEqual([
			expect.objectContaining({
				namespace: "default",
				jurisdiction: "unrestricted",
				repo_count: 2,
			}),
		]);
		const namespace = await expectValidResponse(
			await api(mf, "/default"),
			zArtifactsNamespacesGetResponse,
			expect
		);
		expect(namespace.result.repo_count).toBe(2);
		expect(await errorOf(await api(mf, "/elsewhere"))).toEqual({
			status: 404,
			code: 10200,
		});
		expect(
			await errorOf(await api(mf, "/elsewhere/repos", "POST", { name: "demo" }))
		).toEqual({ status: 404, code: 10200 });

		const deleted = await expectValidResponse(
			await api(mf, "/default/repos/demo-fork", "DELETE"),
			zArtifactsReposDeleteResponse,
			expect,
			202
		);
		expect(deleted.result).toEqual({ id: fork.result.id });
		expect(
			await errorOf(await api(mf, "/default/repos/demo-fork", "DELETE"))
		).toEqual({
			status: 404,
			code: 10200,
		});
		expect(await errorOf(await api(mf, "/default/repos/demo-fork"))).toEqual({
			status: 404,
			code: 10200,
		});
	});

	test("creates, lists, and revokes repository tokens", async ({ expect }) => {
		const mf = await startCfLocal(await useTmp());
		useDispose(mf);
		await (
			await api(mf, "/default/repos", "POST", { name: "demo" })
		).body?.cancel();

		const token = await expectValidResponse(
			await api(mf, "/default/tokens", "POST", {
				repo: "demo",
				scope: "read",
				ttl: 3600,
			}),
			zArtifactsTokensCreateResponse,
			expect,
			201
		);
		expect(token.result).toMatchObject({
			scope: "read",
			plaintext: expect.stringMatching(/^art_v2_/),
		});

		const active = await expectValidResponse(
			await api(mf, "/default/repos/demo/tokens"),
			zArtifactsRepoTokensListResponse,
			expect
		);
		// The token issued with the repository, then the new one, newest first.
		expect(active.result.map(({ scope }) => scope)).toEqual(["read", "write"]);
		expect(active.result[0]).toMatchObject({
			id: token.result.id,
			state: "active",
		});
		expect(active.result_info).toMatchObject({
			page: 1,
			per_page: 30,
			total_count: 2,
		});

		const revoked = await expectValidResponse(
			await api(mf, `/default/tokens/${token.result.id}`, "DELETE"),
			zArtifactsTokensRevokeResponse,
			expect
		);
		expect(revoked.result).toEqual({ id: token.result.id });
		expect(
			await errorOf(
				await api(mf, `/default/tokens/${token.result.id}`, "DELETE")
			)
		).toEqual({ status: 404, code: 10200 });

		const history = await expectValidResponse(
			await api(mf, "/default/repos/demo/tokens?state=revoked"),
			zArtifactsRepoTokensListResponse,
			expect
		);
		expect(history.result).toEqual([
			expect.objectContaining({ id: token.result.id, state: "revoked" }),
		]);
		expect(
			await errorOf(
				await api(mf, "/default/tokens", "POST", { repo: "demo", ttl: 1 })
			)
		).toEqual({ status: 400, code: 10103, pointer: "/ttl" });
		expect(
			await errorOf(
				await api(mf, "/default/tokens", "POST", { repo: "missing" })
			)
		).toEqual({ status: 404, code: 10200 });
	});

	test("rejects invalid bodies with the deployed error codes", async ({
		expect,
	}) => {
		const mf = await startCfLocal(await useTmp());
		useDispose(mf);
		expect(
			await errorOf(await api(mf, "/default/repos", "POST", { name: "-bad" }))
		).toEqual({ status: 400, code: 10101, pointer: "/name" });
		expect(
			await errorOf(
				await api(mf, "/default/repos", "POST", {
					name: "ok",
					default_branch: "..",
				})
			)
		).toEqual({ status: 400, code: 10100, pointer: "/default_branch" });
		expect(
			await errorOf(
				await api(mf, "/default/repos/ok/import", "POST", { url: "not a url" })
			)
		).toEqual({ status: 400, code: 10104, pointer: "/url" });
		const malformed = await mf.dispatchFetch(`${API}/default/repos`, {
			method: "POST",
			body: "{",
			headers: { "Content-Type": "application/json" },
		});
		expect(await errorOf(malformed)).toEqual({ status: 400, code: 10100 });
	});

	test("reports missing Git without failing other local resources", async ({
		expect,
	}) => {
		const emptyPath = await useTmp();
		const previousPath = process.env.PATH;
		process.env.PATH = emptyPath;
		let mf: Miniflare;
		try {
			mf = await startCfLocal(await useTmp());
		} finally {
			process.env.PATH = previousPath;
		}
		useDispose(mf);
		expect(await errorOf(await api(mf, "/default/repos"))).toEqual({
			status: 503,
			code: 10401,
		});
		const kv = await mf.dispatchFetch(
			`http://localhost${CorePaths.EXPLORER}/api/storage/kv/namespaces`
		);
		expect(kv.status).toBe(200);
		await kv.body?.cancel();
	});
});

describe("Artifacts state shared with a dev session", () => {
	test("a repository created by `cf --local` appears in a later dev session", async ({
		expect,
	}) => {
		const persist = await useTmp();
		const cf = await startCfLocal(persist);
		const created = (await (
			await api(cf, "/default/repos", "POST", { name: "demo" })
		).json()) as { result: { id: string; remote: string } };
		await disposeWithRetry(cf);

		const dev = await startDev(persist);
		useDispose(dev);
		const list = await callBinding<{ repos: { id: string; name: string }[] }>(
			dev,
			"list"
		);
		expect(list.repos).toEqual([
			expect.objectContaining({ id: created.result.id, name: "demo" }),
		]);
		// The recorded Git port is reused, so the returned remote stays valid.
		const info = await callBinding<{ remote: string }>(dev, "info", "demo");
		expect(info.remote).toBe(created.result.remote);
	});

	test("a dev session's namespace is found by a later `cf --local`", async ({
		expect,
	}) => {
		const persist = await useTmp();
		const dev = await startDev(persist, "examples");
		await callBinding(dev, "create", "from-dev");
		await disposeWithRetry(dev);

		const cf = await startCfLocal(persist);
		useDispose(cf);
		const namespaces = await expectValidResponse(
			await api(cf, ""),
			zArtifactsNamespacesListResponse,
			expect
		);
		expect(namespaces.result.map(({ namespace }) => namespace)).toEqual([
			"default",
			"examples",
		]);
		const repos = await expectValidResponse(
			await api(cf, "/examples/repos"),
			zArtifactsReposListResponse,
			expect
		);
		expect(repos.result.map(({ name }) => name)).toEqual(["from-dev"]);
	});

	test("`cf --local` writes are visible to, and cloneable from, a running dev session", async ({
		expect,
	}) => {
		const persist = await useTmp();
		const dev = await startDev(persist);
		useDispose(dev);
		// Load the namespace in the dev session before `cf` writes to it.
		await callBinding(dev, "create", "first");
		const devRemote = (
			await callBinding<{ remote: string }>(dev, "info", "first")
		).remote;

		const cf = await startCfLocal(persist);
		const created = (await (
			await api(cf, "/default/repos", "POST", { name: "second" })
		).json()) as { result: { remote: string; token: string } };
		await disposeWithRetry(cf);

		const list = await callBinding<{ repos: { name: string }[] }>(dev, "list");
		expect(list.repos.map(({ name }) => name).sort()).toEqual([
			"first",
			"second",
		]);
		// `cf` exits straight away, so it names the dev session's Git listener.
		expect(new URL(created.result.remote).origin).toBe(
			new URL(devRemote).origin
		);
		const checkout = path.join(await useTmp(), "second");
		await exec("git", [
			"-c",
			`http.extraHeader=Authorization: Bearer ${created.result.token}`,
			"clone",
			"--quiet",
			created.result.remote,
			checkout,
		]);
	});

	test("a dev session's explorer manages its bound namespace only", async ({
		expect,
	}) => {
		const dev = await startDev(await useTmp(), "examples");
		useDispose(dev);
		await (
			await api(dev, "/examples/repos", "POST", { name: "ui" })
		).body?.cancel();
		const list = await callBinding<{ repos: { name: string }[] }>(dev, "list");
		expect(list.repos.map(({ name }) => name)).toEqual(["ui"]);
		const namespaces = await expectValidResponse(
			await api(dev, ""),
			zArtifactsNamespacesListResponse,
			expect
		);
		expect(namespaces.result.map(({ namespace }) => namespace)).toEqual([
			"examples",
		]);
	});

	test("an explorer without Artifacts state starts no namespaces", async ({
		expect,
	}) => {
		const mf = createUnboundStorageExplorer();
		useDispose(mf);
		const namespaces = await expectValidResponse(
			await api(mf, ""),
			zArtifactsNamespacesListResponse,
			expect
		);
		expect(namespaces.result).toEqual([]);
	});
});
