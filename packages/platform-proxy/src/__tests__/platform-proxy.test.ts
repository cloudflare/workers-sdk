import { existsSync } from "node:fs";
import {
	mockConsoleMethods,
	runInTempDir,
} from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, vi } from "vitest";
import { startPlatformProxy } from "../platform-proxy";
import type { ParsedInputWorkerConfig } from "@cloudflare/config";

/**
 * Creates a Worker configuration with the given bindings.
 *
 * @param env The Worker's bindings
 * @returns The Worker configuration
 */
function createWorker(
	env: ParsedInputWorkerConfig["env"]
): ParsedInputWorkerConfig {
	return {
		name: "my-worker",
		compatibilityDate: "2026-10-01",
		env,
	} as ParsedInputWorkerConfig;
}

type Env = {
	GREETING: string;
	KV: KVNamespace;
};

describe("startPlatformProxy()", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("emulates the Worker's bindings", async ({ expect }) => {
		const { env, dispose } = await startPlatformProxy<Env>(
			createWorker({
				GREETING: { type: "text", value: "hello" },
				KV: { type: "kv" },
			}),
			process.cwd()
		);

		try {
			expect(env.GREETING).toBe("hello");
			await env.KV.put("key", "value");
			expect(await env.KV.get("key")).toBe("value");
		} finally {
			await dispose();
		}
	});

	it("persists binding data to .cloudflare/state, like the Cloudflare Vite plugin", async ({
		expect,
	}) => {
		const worker = createWorker({ KV: { type: "kv" } });

		const first = await startPlatformProxy<Env>(worker, process.cwd());
		await first.env.KV.put("key", "value");
		await first.dispose();
		const second = await startPlatformProxy<Env>(worker, process.cwd());
		try {
			expect(await second.env.KV.get("key")).toBe("value");
			expect(existsSync(".cloudflare/state/v3")).toBe(true);
		} finally {
			await second.dispose();
		}
	});

	it("doesn't persist binding data when persist is false", async ({
		expect,
	}) => {
		const worker = createWorker({ KV: { type: "kv" } });

		const first = await startPlatformProxy<Env>(worker, process.cwd(), {
			persist: false,
		});
		await first.env.KV.put("key", "value");
		await first.dispose();
		const second = await startPlatformProxy<Env>(worker, process.cwd(), {
			persist: false,
		});
		try {
			expect(await second.env.KV.get("key")).toBeNull();
			expect(existsSync(".cloudflare")).toBe(false);
		} finally {
			await second.dispose();
		}
	});

	it("leaves out the bindings it can't emulate, with a warning", async ({
		expect,
	}) => {
		vi.stubEnv(
			"CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_OVERRIDDEN_DB",
			"postgres://user:password@localhost:5432/overridden"
		);
		const { env, dispose } = await startPlatformProxy(
			createWorker({
				SECRET: { type: "secret" },
				ASSETS: { type: "assets" },
				COUNTER: {
					type: "durable-object",
					worker: "my-worker",
					exportName: "Counter",
				},
				API: { type: "worker", worker: "my-worker", exportName: "Api" },
				REMOTE_KV: { type: "kv", id: "abc", dev: { remote: true } },
				DB: { type: "hyperdrive", id: "def" },
				LOCAL_DB: {
					type: "hyperdrive",
					id: "ghi",
					dev: {
						connectionString: "postgres://user:password@localhost:5432/local",
					},
				},
				OVERRIDDEN_DB: { type: "hyperdrive", id: "jkl" },
			}),
			process.cwd()
		);

		try {
			expect(Object.keys(env).sort()).toEqual(["LOCAL_DB", "OVERRIDDEN_DB"]);
			expect(std.warn).toMatchInlineSnapshot(`
				"The platform proxy leaves out the \`SECRET\` binding: secrets aren't supported yet.
				The platform proxy leaves out the \`ASSETS\` binding: the assets binding isn't supported yet.
				The platform proxy leaves out the \`COUNTER\` binding: it refers to this Worker's own code, which the platform proxy doesn't run.
				The platform proxy leaves out the \`API\` binding: it refers to this Worker's own code, which the platform proxy doesn't run.
				The platform proxy leaves out the \`REMOTE_KV\` binding: remote bindings aren't supported yet.
				The platform proxy leaves out the \`DB\` binding: it needs \`dev.connectionString\` for local development."
			`);
		} finally {
			await dispose();
		}
	});

	it("provides stand-ins for cf, ctx and caches", async ({ expect }) => {
		const { cf, ctx, caches, dispose } = await startPlatformProxy(
			createWorker({}),
			process.cwd()
		);

		try {
			expect(Object.isFrozen(cf)).toBe(true);
			expect(() => ctx.waitUntil(Promise.resolve())).not.toThrow();
			expect(await caches.default.match("https://example.com")).toBe(undefined);
		} finally {
			await dispose();
		}
	});
});
