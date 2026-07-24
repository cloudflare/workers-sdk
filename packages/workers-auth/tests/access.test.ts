import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	it,
	vi,
} from "vitest";
import {
	clearAccessCaches,
	domainUsesAccess,
	getAccessHeaders,
} from "../src/access";
import { mswAccessHandlers } from "../src/test-helpers/msw-handlers/access";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

vi.mock("node:child_process", () => ({
	spawnSync: vi.fn((binary: string) => {
		if (binary === "cloudflared") {
			return { error: true };
		}
		return {
			error: null,
			stdout: Buffer.from(""),
			stderr: Buffer.from(""),
			status: 0,
		};
	}),
	spawn: vi.fn(() =>
		createFakeCloudflaredProcess({
			spawnError: new Error("spawn cloudflared ENOENT"),
		})
	),
}));

/**
 * A minimal stand-in for the `cloudflared access login` child process.
 *
 * `cloudflared` only exits once the user completes (or abandons) the
 * authorization flow in the browser, so the fake keeps running until
 * `delayMs` elapses (success) or it is killed.
 */
function createFakeCloudflaredProcess(
	outcome: { spawnError: Error } | { stdout: string; delayMs: number }
): ChildProcessWithoutNullStreams {
	const child = new EventEmitter() as EventEmitter & {
		stdout: EventEmitter;
		stderr: EventEmitter & { resume: () => void };
		killed: boolean;
		kill: () => boolean;
	};
	child.stdout = new EventEmitter();
	child.stderr = Object.assign(new EventEmitter(), { resume: () => {} });
	child.killed = false;
	child.kill = () => {
		child.killed = true;
		child.emit("close", null, "SIGTERM");
		return true;
	};
	if ("spawnError" in outcome) {
		setImmediate(() => child.emit("error", outcome.spawnError));
	} else {
		setTimeout(() => {
			if (!child.killed) {
				// Emit in two chunks, as a real pipe is free to do.
				const stdout = Buffer.from(outcome.stdout);
				child.stdout.emit("data", stdout.subarray(0, 8));
				child.stdout.emit("data", stdout.subarray(8));
				child.emit("close", 0, null);
			}
		}, outcome.delayMs);
	}
	return child as unknown as ChildProcessWithoutNullStreams;
}

const msw = setupServer();

beforeAll(() => msw.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
	msw.restoreHandlers();
	msw.resetHandlers();
});
afterAll(() => msw.close());

const silentLogger = {
	debug: () => {},
	info: () => {},
	log: () => {},
	warn: vi.fn(),
	error: () => {},
};

const isNonInteractiveOrCI = () => true;

describe("access", () => {
	beforeEach(() => {
		clearAccessCaches();
		silentLogger.warn = vi.fn();
		msw.use(...mswAccessHandlers);
	});

	describe("domainUsesAccess", () => {
		it("should correctly detect an access protected domain", async ({
			expect,
		}) => {
			expect(
				await domainUsesAccess("access-protected.com", silentLogger)
			).toBeTruthy();
			expect(
				await domainUsesAccess("not-access-protected.com", silentLogger)
			).toBeFalsy();
		});

		it("should return false when the domain responds with a 403 (service-auth-only Access app)", async ({
			expect,
		}) => {
			// When an Access application is configured to only allow Service
			// Auth tokens, the domain responds with a hard 403 instead of
			// redirecting to cloudflareaccess.com, so this detection method
			// cannot recognise it as Access-protected. This is why
			// `getAccessHeaders` must check the env vars before calling
			// `domainUsesAccess`.
			expect(
				await domainUsesAccess("access-service-auth-only.com", silentLogger)
			).toBeFalsy();
		});
	});

	describe("getAccessHeaders", () => {
		it("should return empty headers for non-access-protected domains", async ({
			expect,
		}) => {
			expect(
				await getAccessHeaders("not-access-protected.com", {
					logger: silentLogger,
					isNonInteractiveOrCI,
				})
			).toEqual({});
		});

		describe("service token authentication", () => {
			it("should return service token headers when both env vars are set", async ({
				expect,
			}) => {
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_ID", "test-client-id.access");
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_SECRET", "test-client-secret");

				const headers = await getAccessHeaders("access-protected.com", {
					logger: silentLogger,
					isNonInteractiveOrCI,
				});
				expect(headers).toEqual({
					"CF-Access-Client-Id": "test-client-id.access",
					"CF-Access-Client-Secret": "test-client-secret",
				});
				// No warning is presented since both env variables are set
				expect(silentLogger.warn).not.toHaveBeenCalled();
			});

			it("should return service token headers for a service-auth-only domain (403 response)", async ({
				expect,
			}) => {
				// Regression test: when the Access application is configured to
				// only allow Service Auth tokens, the domain responds with a
				// hard 403 instead of redirecting to cloudflareaccess.com.
				// `domainUsesAccess` returns false in this case, so the env var
				// check must happen first - otherwise empty headers would be
				// returned and the request would fail with a 403.
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_ID", "test-client-id.access");
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_SECRET", "test-client-secret");

				const headers = await getAccessHeaders("access-service-auth-only.com", {
					logger: silentLogger,
					isNonInteractiveOrCI,
				});
				expect(headers).toEqual({
					"CF-Access-Client-Id": "test-client-id.access",
					"CF-Access-Client-Secret": "test-client-secret",
				});
				expect(silentLogger.warn).not.toHaveBeenCalled();
			});

			it("should warn when only CLOUDFLARE_ACCESS_CLIENT_ID is set", async ({
				expect,
			}) => {
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_ID", "test-client-id.access");

				await expect(
					getAccessHeaders("access-protected.com", {
						logger: silentLogger,
						isNonInteractiveOrCI: () => true,
					})
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The domain "access-protected.com" is behind Cloudflare Access, but no Access Service Token credentials were found and the current environment is non-interactive.
Set the CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET environment variables to authenticate with an Access Service Token.
See https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/]`
				);
				expect(silentLogger.warn).toHaveBeenCalledWith(
					expect.stringContaining(
						"Both CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET must be set"
					)
				);
				expect(silentLogger.warn).toHaveBeenCalledWith(
					expect.stringContaining("Only CLOUDFLARE_ACCESS_CLIENT_ID was found")
				);
			});

			it("should warn when only CLOUDFLARE_ACCESS_CLIENT_SECRET is set", async ({
				expect,
			}) => {
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_SECRET", "test-client-secret");

				await expect(
					getAccessHeaders("access-protected.com", {
						logger: silentLogger,
						isNonInteractiveOrCI: () => true,
					})
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The domain "access-protected.com" is behind Cloudflare Access, but no Access Service Token credentials were found and the current environment is non-interactive.
Set the CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET environment variables to authenticate with an Access Service Token.
See https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/]`
				);
				expect(silentLogger.warn).toHaveBeenCalledWith(
					expect.stringContaining(
						"Both CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET must be set"
					)
				);
				expect(silentLogger.warn).toHaveBeenCalledWith(
					expect.stringContaining(
						"Only CLOUDFLARE_ACCESS_CLIENT_SECRET was found"
					)
				);
			});
		});

		describe("non-interactive environment", () => {
			it("should throw actionable error when non-interactive and no service token", async ({
				expect,
			}) => {
				await expect(
					getAccessHeaders("access-protected.com", {
						logger: silentLogger,
						isNonInteractiveOrCI,
					})
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: The domain "access-protected.com" is behind Cloudflare Access, but no Access Service Token credentials were found and the current environment is non-interactive.
Set the CLOUDFLARE_ACCESS_CLIENT_ID and CLOUDFLARE_ACCESS_CLIENT_SECRET environment variables to authenticate with an Access Service Token.
See https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/]`
				);
			});
		});

		describe("interactive environment (cloudflared fallback)", () => {
			it("should keep the event loop responsive while cloudflared waits for browser authorization", async ({
				expect,
			}) => {
				// Regression test for https://github.com/cloudflare/workers-sdk/issues/12900.
				// `cloudflared access login` blocks until the user completes the
				// authorization flow in the browser, which can take arbitrarily
				// long (or never happen). If wrangler waits for it synchronously,
				// no SIGINT or keypress handler can run in the meantime, so
				// ctrl+c cannot interrupt wrangler. Both mock implementations
				// model that waiting behavior for their respective APIs; the
				// timer below can only fire while cloudflared is still running
				// if the event loop stays free during the wait.
				vi.mocked(spawnSync).mockImplementationOnce(() => {
					Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
					const stdout = Buffer.from(
						"fetched your token:\n\ntest-access-token\n"
					);
					return {
						pid: 0,
						output: [null, stdout, Buffer.from("")],
						stdout,
						stderr: Buffer.from(""),
						status: 0,
						signal: null,
					};
				});
				vi.mocked(spawn).mockImplementationOnce(() =>
					createFakeCloudflaredProcess({
						stdout: "fetched your token:\n\ntest-access-token\n",
						delayMs: 100,
					})
				);

				let eventLoopTicked = false;
				const timer = setTimeout(() => {
					eventLoopTicked = true;
				}, 10);
				const headers = await getAccessHeaders("access-protected.com", {
					logger: silentLogger,
					isNonInteractiveOrCI: () => false,
				});
				clearTimeout(timer);

				expect(headers).toEqual({
					Cookie: "CF_Authorization=test-access-token",
				});
				expect(eventLoopTicked).toBe(true);
			});

			it("should return the CF_Authorization cookie header once cloudflared completes", async ({
				expect,
			}) => {
				vi.mocked(spawn).mockImplementationOnce(() =>
					createFakeCloudflaredProcess({
						stdout: "fetched your token:\n\ntest-access-token\n",
						delayMs: 10,
					})
				);

				const headers = await getAccessHeaders("access-protected.com", {
					logger: silentLogger,
					isNonInteractiveOrCI: () => false,
				});

				expect(headers).toEqual({
					Cookie: "CF_Authorization=test-access-token",
				});
				expect(spawn).toHaveBeenCalledWith("cloudflared", [
					"access",
					"login",
					"access-protected.com",
				]);
			});

			it("should kill a still-pending cloudflared when the process exits", async ({
				expect,
			}) => {
				// If the user interrupts wrangler before completing the
				// authorization flow in the browser, the cloudflared child
				// must not be left running.
				const child = createFakeCloudflaredProcess({
					stdout: "fetched your token:\n\ntest-access-token\n",
					delayMs: 10_000,
				});
				vi.mocked(spawn).mockImplementationOnce(() => child);
				const exitListenersBefore = process.rawListeners("exit");

				const pendingHeaders = getAccessHeaders("access-protected.com", {
					logger: silentLogger,
					isNonInteractiveOrCI: () => false,
				});
				// The exit hook is only registered once cloudflared has been
				// spawned, which happens after the async Access-detection probe.
				await vi.waitFor(() => {
					if (
						process.listenerCount("exit") !==
						exitListenersBefore.length + 1
					) {
						throw new Error("cloudflared exit hook not registered yet");
					}
				});
				const exitHook = process
					.rawListeners("exit")
					.find((listener) => !exitListenersBefore.includes(listener)) as
					| (() => void)
					| undefined;

				expect(exitHook).toBeDefined();
				exitHook?.();

				expect(child.killed).toBe(true);
				await expect(pendingHeaders).rejects.toThrow(
					"Failed to authenticate with Cloudflare Access"
				);
				expect(process.listenerCount("exit")).toBe(exitListenersBefore.length);
			});

			it("should error without cloudflared installed on an access protected domain", async ({
				expect,
			}) => {
				await expect(
					getAccessHeaders("access-protected.com", {
						logger: silentLogger,
						isNonInteractiveOrCI: () => false,
					})
				).rejects.toThrowErrorMatchingInlineSnapshot(
					`[Error: To use Wrangler with Cloudflare Access, please install \`cloudflared\` from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation]`
				);
			});
		});
	});
});
