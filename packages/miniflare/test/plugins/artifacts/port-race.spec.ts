import net from "node:net";
import { Miniflare } from "miniflare";
import { test, vi } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { MiniflareOptions } from "miniflare";
import type { ExpectStatic } from "vitest";

// Regression tests for https://github.com/cloudflare/workers-sdk/issues/17180.
// Several Miniflare instances starting at once each bind ephemeral loopback
// ports. Any port Miniflare frees before workerd binds its Artifacts Git
// socket can be taken by one of them, failing startup with
// `ERR_ADDRESS_IN_USE`. These tests take that port deterministically.

const SCRIPT = `
export default {
  async fetch(request, env) {
    const { method, name, args = [] } = await request.json();
    try {
      const target = name === undefined ? env.REPOS : await env.REPOS.get(name);
      return Response.json(await target[method](...args));
    } catch (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
  }
};
`;

function options(resourcePersistencePath: string): MiniflareOptions {
	return {
		cf: false,
		resourcePersistencePath,
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2026-09-03",
					env: {
						REPOS: {
							type: "artifacts",
							namespace: "race",
							dev: { remote: false },
						},
					},
					manifest: singleModuleManifest(SCRIPT),
				},
			},
		],
	};
}

type Repository = { remote: string; token: string };

async function rpc(
	mf: Miniflare,
	method: string,
	args: unknown[] = [],
	name?: string
): Promise<Repository> {
	const response = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({ method, args, name }),
	});
	const result = (await response.json()) as Repository & { error?: string };
	if (!response.ok) {
		throw new Error(result.error);
	}
	return result;
}

/**
 * Acts as another process on the host: the first time a Node listener on
 * 127.0.0.1 releases its port, binds that port before the closer resumes.
 *
 * @returns A function that stops watching and releases the port taken.
 */
function takeFirstReleasedLoopbackPort(): () => Promise<void> {
	const close = net.Server.prototype.close;
	let blocker: net.Server | undefined;
	const spy = vi
		.spyOn(net.Server.prototype, "close")
		.mockImplementation(function (
			this: net.Server,
			callback?: (error?: Error) => void
		) {
			const address = this.address();
			if (
				blocker !== undefined ||
				address === null ||
				typeof address === "string" ||
				address.address !== "127.0.0.1"
			) {
				return close.call(this, callback);
			}
			const taker = net.createServer();
			blocker = taker;
			return close.call(this, (error?: Error) => {
				let resumed = false;
				const resume = () => {
					if (!resumed) {
						resumed = true;
						callback?.(error);
					}
				};
				// Once workerd owns the port this bind fails, which is fine.
				taker.once("error", resume);
				taker.listen({ host: "127.0.0.1", port: address.port }, resume);
			});
		});
	return async () => {
		spy.mockRestore();
		const taken = blocker;
		if (taken?.listening) {
			await new Promise<void>((resolve) => taken.close(() => resolve()));
		}
	};
}

async function expectRemoteServed(
	expect: ExpectStatic,
	repository: Repository
): Promise<void> {
	const response = await fetch(
		`${repository.remote}/info/refs?service=git-upload-pack`,
		{ headers: { Authorization: `Bearer ${repository.token}` } }
	);
	expect(response.status).toBe(200);
	await response.body?.cancel();
}

test("artifacts: startup succeeds when another process binds a port Miniflare released", async ({
	expect,
}) => {
	const release = takeFirstReleasedLoopbackPort();
	const mf = new Miniflare(options(await useTmp()));
	useDispose(mf);
	try {
		await expect(mf.ready).resolves.toBeInstanceOf(URL);
	} finally {
		await release();
	}
	await expectRemoteServed(expect, await rpc(mf, "create", ["repo"]));
});

test("artifacts: restart succeeds when another process binds the persisted Git port after Miniflare checks it", async ({
	expect,
}) => {
	const root = await useTmp();
	const first = new Miniflare(options(root));
	useDispose(first);
	const created = await rpc(first, "create", ["repo"]);
	await first.dispose();

	const release = takeFirstReleasedLoopbackPort();
	const second = new Miniflare(options(root));
	useDispose(second);
	try {
		await expect(second.ready).resolves.toBeInstanceOf(URL);
	} finally {
		await release();
	}
	const info = await rpc(second, "info", [], "repo");
	await expectRemoteServed(expect, {
		remote: info.remote,
		token: created.token,
	});
});
