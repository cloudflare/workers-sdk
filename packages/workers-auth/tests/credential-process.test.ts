import assert from "node:assert";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { EncryptedFileCredentialStore } from "../src/credential-store/encrypted-file-store";
import { FileCredentialStore } from "../src/credential-store/file-store";
import { getRefreshLockPath, withRefreshLock } from "../src/refresh-lock";
import type { ChildProcess } from "node:child_process";
import type { Server } from "node:http";

function deferred() {
	let resolve = () => {};
	const promise = new Promise<void>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

describe("credential transactions across processes", () => {
	runInTempDir();
	let fixtureDirectory: string;
	let fixturePath: string;
	const children: { process: ChildProcess; exited: Promise<unknown> }[] = [];
	const servers: Server[] = [];

	beforeAll(async () => {
		fixtureDirectory = mkdtempSync(
			path.join(os.tmpdir(), "credential-process-")
		);
		fixturePath = path.join(fixtureDirectory, "fixture.mjs");
		const result = await build({
			entryPoints: [
				path.join(import.meta.dirname, "fixtures/credential-process.ts"),
			],
			bundle: true,
			platform: "node",
			format: "esm",
			write: false,
			plugins: [
				{
					name: "resolve-external-packages",
					setup(builder) {
						builder.onResolve({ filter: /^[^./]/ }, (args) => ({
							path: args.path.startsWith("node:")
								? args.path
								: import.meta.resolve(args.path),
							external: true,
						}));
					},
				},
			],
		});
		assert(result.outputFiles[0]);
		writeFileSync(fixturePath, result.outputFiles[0].contents);
	});

	afterEach(async () => {
		for (const child of children.splice(0)) {
			if (
				child.process.exitCode === null &&
				child.process.signalCode === null
			) {
				child.process.kill("SIGKILL");
			}
			await child.exited;
		}
		for (const server of servers.splice(0)) {
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});
	afterAll(() => removeDirSync(fixtureDirectory));

	function startChild(command: string, backend = "file", endpoint?: string) {
		const child = spawn(
			process.execPath,
			[fixturePath, command, process.cwd(), backend],
			{
				stdio: ["ignore", "pipe", "pipe", "ipc"],
				env: {
					...process.env,
					WRANGLER_TOKEN_URL: endpoint ? `${endpoint}/token` : undefined,
					WRANGLER_REVOKE_URL: endpoint ? `${endpoint}/revoke` : undefined,
				},
			}
		);
		const events: string[] = [];
		let errors = "";
		child.stderr?.on("data", (chunk) => {
			errors += String(chunk);
		});
		child.on("message", (message) => {
			if (
				typeof message === "object" &&
				message !== null &&
				"event" in message
			) {
				events.push(String(message.event));
				if ("message" in message) {
					errors += String(message.message);
				}
			}
		});
		const exited = once(child, "exit").then(([code]) => ({ code, errors }));
		children.push({ process: child, exited });
		return {
			process: child,
			exited,
			async waitFor(event: string) {
				while (!events.includes(event)) {
					assert(
						child.exitCode === null && child.signalCode === null,
						errors || `Child exited before ${event}`
					);
					await Promise.race([once(child, "message"), exited]);
				}
			},
		};
	}

	function seedCredentials() {
		const storage = new FileCredentialStore(process.cwd());
		storage.write({
			oauth_token: "expired",
			refresh_token: "RT_A",
			expiration_time: new Date(0).toISOString(),
		});
		return storage;
	}

	async function startAuthServer() {
		const received = deferred();
		const finish = deferred();
		const requests: { route: string | undefined; token: string | null }[] = [];
		const server = createServer((request, response) => {
			void (async () => {
				let body = "";
				for await (const chunk of request) {
					body += String(chunk);
				}
				const params = new URLSearchParams(body);
				requests.push({
					route: request.url,
					token: params.get(
						request.url === "/token" ? "refresh_token" : "token"
					),
				});
				if (request.url === "/token") {
					received.resolve();
					await finish.promise;
					response.setHeader("Content-Type", "application/json");
					response.end(
						JSON.stringify({
							access_token: "fresh",
							refresh_token: "RT_B",
							expires_in: 3600,
							scope: "account:read",
						})
					);
				} else {
					response.end();
				}
			})().catch((error: unknown) =>
				response.destroy(error instanceof Error ? error : undefined)
			);
		});
		servers.push(server);
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		assert(address && typeof address !== "string");
		return {
			endpoint: `http://127.0.0.1:${address.port}`,
			requests,
			received,
			finish,
		};
	}

	it("fails closed while a slow sibling owns the lock and recovers after its crash", async ({
		expect,
	}) => {
		const lockDir = getRefreshLockPath(
			new FileCredentialStore(process.cwd()).path()
		);
		const holder = startChild("hold");
		await holder.waitFor("locked");
		let called = false;
		await expect(
			withRefreshLock(
				lockDir,
				async () => {
					called = true;
				},
				{ maxRetries: 3, retryDelayMs: 10 }
			)
		).rejects.toThrow("Another process");
		expect(called).toBe(false);
		holder.process.kill("SIGKILL");
		await holder.exited;
		await withRefreshLock(lockDir, async () => {
			called = true;
		});
		expect(called).toBe(true);
	});

	it("does not publish an owner if a process crashes while preparing acquisition", async ({
		expect,
	}) => {
		const child = startChild("crash-before-publish");
		expect((await child.exited).code).toBe(79);
		const lockDir = getRefreshLockPath(
			new FileCredentialStore(process.cwd()).path()
		);
		expect(existsSync(lockDir)).toBe(false);
		expect(await withRefreshLock(lockDir, async () => "acquired")).toBe(
			"acquired"
		);
	});

	it("exchanges a single-use token once when several siblings recover a crashed holder", async ({
		expect,
	}) => {
		const storage = seedCredentials();
		const holder = startChild("hold");
		await holder.waitFor("locked");
		holder.process.kill("SIGKILL");
		await holder.exited;
		const auth = await startAuthServer();
		auth.finish.resolve();
		const refreshes = Array.from({ length: 4 }, () =>
			startChild("refresh", "file", auth.endpoint)
		);
		expect(await Promise.all(refreshes.map((child) => child.exited))).toEqual(
			Array.from({ length: 4 }, () => ({ code: 0, errors: "" }))
		);
		expect(storage.read()?.refresh_token).toBe("RT_B");
		expect(auth.requests).toEqual([{ route: "/token", token: "RT_A" }]);
	});

	it("preserves complete credentials if a process crashes before replacement", async ({
		expect,
	}) => {
		const storage = seedCredentials();
		const original = readFileSync(storage.path(), "utf8");
		const child = startChild("crash-before-write");
		expect((await child.exited).code).toBe(79);
		expect(readFileSync(storage.path(), "utf8")).toBe(original);
		expect(storage.read()?.refresh_token).toBe("RT_A");
	});

	it("does not migrate stale plaintext while a sibling is refreshing", async ({
		expect,
	}) => {
		const storage = seedCredentials();
		const auth = await startAuthServer();
		const refresh = startChild("refresh", "file", auth.endpoint);
		await Promise.race([
			auth.received.promise,
			refresh.exited.then((result) => {
				throw new Error(JSON.stringify(result));
			}),
		]);
		const migration = startChild("migrate", "encrypted");
		expect(await migration.exited).toEqual({ code: 0, errors: "" });
		expect(existsSync(storage.path())).toBe(true);
		expect(existsSync(storage.path().replace(/\.toml$/, ".enc"))).toBe(false);
		const encryptedRefresh = startChild("refresh", "encrypted", auth.endpoint);
		await encryptedRefresh.waitFor("pending");
		auth.finish.resolve();
		expect(await refresh.exited).toEqual({ code: 0, errors: "" });
		expect(await encryptedRefresh.exited).toEqual({ code: 0, errors: "" });
		const encrypted = new EncryptedFileCredentialStore(process.cwd(), {
			getKey: () => new Uint8Array(32),
			setKey() {},
			deleteKey() {},
			describe: () => "test key",
		});
		expect(encrypted.read()?.refresh_token).toBe("RT_B");
		expect(auth.requests).toEqual([{ route: "/token", token: "RT_A" }]);
	});

	it("logs out only after a sibling's refresh commits and revokes the rotated token", async ({
		expect,
	}) => {
		const storage = seedCredentials();
		const auth = await startAuthServer();
		const refresh = startChild("refresh", "file", auth.endpoint);
		await Promise.race([
			auth.received.promise,
			refresh.exited.then((result) => {
				throw new Error(JSON.stringify(result));
			}),
		]);
		const logout = startChild("logout", "file", auth.endpoint);
		await logout.waitFor("pending");
		expect(storage.read()?.refresh_token).toBe("RT_A");
		auth.finish.resolve();
		expect(await refresh.exited).toEqual({ code: 0, errors: "" });
		expect(await logout.exited).toEqual({ code: 0, errors: "" });
		expect(storage.read()).toBeUndefined();
		expect(auth.requests).toEqual([
			{ route: "/token", token: "RT_A" },
			{ route: "/revoke", token: "RT_B" },
		]);
	});
});
