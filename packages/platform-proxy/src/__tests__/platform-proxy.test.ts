import { existsSync } from "node:fs";
import { maybeStartOrUpdateRemoteProxySession } from "@cloudflare/remote-bindings";
import {
	mockConsoleMethods,
	runInTempDir,
	seed,
} from "@cloudflare/workers-utils/test-helpers";
import { afterEach, describe, it, vi } from "vitest";
import { startPlatformProxy } from "../platform-proxy";
import type { ParsedInputWorkerConfig } from "@cloudflare/config";

// Starting a real session needs Cloudflare credentials
vi.mock("@cloudflare/remote-bindings", () => ({
	maybeStartOrUpdateRemoteProxySession: vi.fn(),
}));

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
		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockReset();
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
		vi.stubEnv(
			"CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_BOTH_DB",
			"postgres://user:password@localhost:5432/from-env"
		);
		const { env, dispose } = await startPlatformProxy(
			createWorker({
				ASSETS: { type: "assets" },
				COUNTER: {
					type: "durable-object",
					worker: "my-worker",
					exportName: "Counter",
				},
				API: { type: "worker", worker: "my-worker", exportName: "Api" },
				DB: { type: "hyperdrive", id: "def" },
				LOCAL_DB: {
					type: "hyperdrive",
					id: "ghi",
					dev: {
						connectionString: "postgres://user:password@localhost:5432/local",
					},
				},
				OVERRIDDEN_DB: { type: "hyperdrive", id: "jkl" },
				BOTH_DB: {
					type: "hyperdrive",
					id: "mno",
					dev: {
						connectionString:
							"postgres://user:password@localhost:5432/from-config",
					},
				},
			}),
			process.cwd()
		);

		try {
			expect(Object.keys(env).sort()).toEqual([
				"BOTH_DB",
				"LOCAL_DB",
				"OVERRIDDEN_DB",
			]);
			// The environment variable wins over `dev.connectionString`, as in the Cloudflare Vite plugin
			const database = (name: string) => (env[name] as Hyperdrive).database;
			expect(database("LOCAL_DB")).toBe("local");
			expect(database("OVERRIDDEN_DB")).toBe("overridden");
			expect(database("BOTH_DB")).toBe("from-env");
			expect(std.warn).toMatchInlineSnapshot(`
				"The platform proxy leaves out the \`ASSETS\` binding: the assets binding isn't supported yet.
				The platform proxy leaves out the \`COUNTER\` binding: it refers to this Worker's own code, which the platform proxy doesn't run.
				The platform proxy leaves out the \`API\` binding: it refers to this Worker's own code, which the platform proxy doesn't run.
				The platform proxy leaves out the \`DB\` binding: it needs \`dev.connectionString\` or the \`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB\` environment variable for local development."
			`);
		} finally {
			await dispose();
		}
	});

	it("reads secrets from .dev.vars, like the Cloudflare Vite plugin", async ({
		expect,
	}) => {
		await seed({ ".dev.vars": "SECRET=from-dev-vars" });
		const { env, dispose } = await startPlatformProxy<{ SECRET: string }>(
			createWorker({
				SECRET: { type: "secret" },
				MISSING: { type: "secret" },
			}),
			process.cwd()
		);

		try {
			expect(env).toEqual({ SECRET: "from-dev-vars" });
			expect(std.warn).toMatchInlineSnapshot(
				`"Missing required secrets for Worker "my-worker": MISSING. Add them to one of \`.dev.vars.development\`, \`.dev.vars\`, \`.env.development.local\`, \`.env.development\`, \`.env.local\`, or \`.env\`. Alternatively, set them as environment variables."`
			);
		} finally {
			await dispose();
		}
	});

	it("connects remote bindings through a remote session", async ({
		expect,
	}) => {
		const session = { dispose: vi.fn() };
		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockResolvedValue({
			session,
		} as unknown as Awaited<
			ReturnType<typeof maybeStartOrUpdateRemoteProxySession>
		>);
		const worker = createWorker({
			REMOTE_KV: { type: "kv", id: "abc", dev: { remote: true } },
		});

		const { dispose } = await startPlatformProxy(worker, process.cwd(), {
			settings: { accountId: "my-account" },
		});
		expect(maybeStartOrUpdateRemoteProxySession).toHaveBeenCalledWith(
			{
				name: "my-worker",
				target: "cf",
				env: worker.env,
				complianceRegion: undefined,
			},
			null,
			expect.objectContaining({
				key: JSON.stringify([process.cwd(), "my-account"]),
			}),
			expect.objectContaining({ cliDisplayName: "cf" })
		);
		await dispose();
		expect(session.dispose).toHaveBeenCalled();

		vi.mocked(maybeStartOrUpdateRemoteProxySession).mockClear();
		const local = await startPlatformProxy(worker, process.cwd(), {
			remoteBindings: false,
		});
		await local.dispose();
		expect(maybeStartOrUpdateRemoteProxySession).not.toHaveBeenCalled();
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
