import { spawn } from "node:child_process";
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
	spawn: vi.fn(() => {
		const fake = createFakeProcess();
		fake.failSpawn(new Error("spawn cloudflared ENOENT"));
		return fake.child;
	}),
}));

function createFakeProcess(): {
	child: ChildProcessWithoutNullStreams;
	complete(stdout: string): void;
	failSpawn(error: Error): void;
} {
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
	return {
		child: child as unknown as ChildProcessWithoutNullStreams,
		complete(stdout) {
			if (child.killed) {
				return;
			}
			// Emit in two chunks, as a real pipe is free to do.
			const output = Buffer.from(stdout);
			child.stdout.emit("data", output.subarray(0, 8));
			child.stdout.emit("data", output.subarray(8));
			child.emit("close", 0, null);
		},
		failSpawn(error) {
			setImmediate(() => child.emit("error", error));
		},
	};
}

const msw = setupServer();

beforeAll(() => msw.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
	vi.unstubAllEnvs();
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
		vi.unstubAllEnvs();
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

			it("should not reuse service token headers after the env vars are unset", async ({
				expect,
			}) => {
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_ID", "first-client-id.access");
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_SECRET", "first-client-secret");
				await getAccessHeaders("access-protected.com", {
					logger: silentLogger,
					isNonInteractiveOrCI,
				});

				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_ID", undefined);
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_SECRET", undefined);

				await expect(
					getAccessHeaders("access-protected.com", {
						logger: silentLogger,
						isNonInteractiveOrCI,
					})
				).rejects.toThrow("no Access Service Token credentials were found");
			});

			it("should not reuse service token headers when only CLOUDFLARE_ACCESS_CLIENT_ID remains", async ({
				expect,
			}) => {
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_ID", "first-client-id.access");
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_SECRET", "first-client-secret");
				await getAccessHeaders("access-protected.com", {
					logger: silentLogger,
					isNonInteractiveOrCI,
				});

				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_ID", "second-client-id.access");
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_SECRET", undefined);

				await expect(
					getAccessHeaders("access-protected.com", {
						logger: silentLogger,
						isNonInteractiveOrCI,
					})
				).rejects.toThrow("no Access Service Token credentials were found");
				expect(silentLogger.warn).toHaveBeenCalledWith(
					expect.stringContaining("Only CLOUDFLARE_ACCESS_CLIENT_ID was found")
				);
			});

			it("should not reuse service token headers when only CLOUDFLARE_ACCESS_CLIENT_SECRET remains", async ({
				expect,
			}) => {
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_ID", "first-client-id.access");
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_SECRET", "first-client-secret");
				await getAccessHeaders("access-protected.com", {
					logger: silentLogger,
					isNonInteractiveOrCI,
				});

				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_ID", undefined);
				vi.stubEnv("CLOUDFLARE_ACCESS_CLIENT_SECRET", "second-client-secret");

				await expect(
					getAccessHeaders("access-protected.com", {
						logger: silentLogger,
						isNonInteractiveOrCI,
					})
				).rejects.toThrow("no Access Service Token credentials were found");
				expect(silentLogger.warn).toHaveBeenCalledWith(
					expect.stringContaining(
						"Only CLOUDFLARE_ACCESS_CLIENT_SECRET was found"
					)
				);
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
				const fake = createFakeProcess();
				const {
					promise: cloudflaredSpawned,
					resolve: resolveCloudflaredSpawned,
				} = Promise.withResolvers<void>();
				vi.mocked(spawn).mockImplementationOnce(() => {
					resolveCloudflaredSpawned();
					return fake.child;
				});

				const pendingHeaders = getAccessHeaders("access-protected.com", {
					logger: silentLogger,
					isNonInteractiveOrCI: () => false,
				});
				await cloudflaredSpawned;

				// Yield one event-loop turn while cloudflared is still pending. If the
				// login blocked the event loop, this callback could not run.
				await new Promise<void>((resolve) => setImmediate(resolve));

				expect(spawn).toHaveBeenCalledOnce();
				fake.complete("fetched your token:\n\ntest-access-token\n");

				await expect(pendingHeaders).resolves.toEqual({
					Cookie: "CF_Authorization=test-access-token",
				});
			});

			it("should return the CF_Authorization cookie header once cloudflared completes", async ({
				expect,
			}) => {
				const fake = createFakeProcess();
				vi.mocked(spawn).mockReturnValueOnce(fake.child);

				const pendingHeaders = getAccessHeaders("access-protected.com", {
					logger: silentLogger,
					isNonInteractiveOrCI: () => false,
				});
				await vi.waitFor(() => {
					expect(spawn).toHaveBeenCalledOnce();
				});
				fake.complete("fetched your token:\n\ntest-access-token\n");

				await expect(pendingHeaders).resolves.toEqual({
					Cookie: "CF_Authorization=test-access-token",
				});
				expect(spawn).toHaveBeenCalledWith(
					"cloudflared",
					["access", "login", "access-protected.com"],
					{ signal: undefined }
				);
			});

			it("should reuse the cached CF_Authorization cookie header", async ({
				expect,
			}) => {
				const fake = createFakeProcess();
				vi.mocked(spawn).mockReturnValueOnce(fake.child);

				const firstHeaders = getAccessHeaders("access-protected.com", {
					logger: silentLogger,
					isNonInteractiveOrCI: () => false,
				});
				await vi.waitFor(() => {
					expect(spawn).toHaveBeenCalledOnce();
				});
				fake.complete("fetched your token:\n\ntest-access-token\n");

				await expect(firstHeaders).resolves.toEqual({
					Cookie: "CF_Authorization=test-access-token",
				});
				await expect(
					getAccessHeaders("access-protected.com", {
						logger: silentLogger,
						isNonInteractiveOrCI: () => false,
					})
				).resolves.toEqual({
					Cookie: "CF_Authorization=test-access-token",
				});
				expect(spawn).toHaveBeenCalledOnce();
			});

			it("should kill a still-pending cloudflared when the process exits", async ({
				expect,
			}) => {
				// If the user interrupts wrangler before completing the
				// authorization flow in the browser, the cloudflared child
				// must not be left running.
				const fake = createFakeProcess();
				vi.mocked(spawn).mockImplementationOnce(() => fake.child);
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

				expect(fake.child.killed).toBe(true);
				await expect(pendingHeaders).rejects.toThrow(
					"Failed to authenticate with Cloudflare Access"
				);
				expect(process.listenerCount("exit")).toBe(exitListenersBefore.length);
			});

			it("should abort a pending cloudflared authorization when the signal aborts", async ({
				expect,
			}) => {
				const fake = createFakeProcess();
				const spawnImpl = (
					_binary: string,
					_args: readonly string[],
					options?: { signal?: AbortSignal }
				) => {
					// Mirror Node's behavior for `spawn(..., { signal })`: an abort
					// kills the child and emits an AbortError on it.
					options?.signal?.addEventListener("abort", () => {
						fake.child.kill();
						const error = new Error("The operation was aborted");
						error.name = "AbortError";
						fake.child.emit("error", error);
					});
					return fake.child;
				};
				vi.mocked(spawn).mockImplementationOnce(
					spawnImpl as unknown as typeof spawn
				);

				const controller = new AbortController();
				const pendingHeaders = getAccessHeaders("access-protected.com", {
					logger: silentLogger,
					isNonInteractiveOrCI: () => false,
					signal: controller.signal,
				});
				// Abort once cloudflared has been spawned, which happens after the
				// async Access-detection probe.
				await vi.waitFor(() => {
					if (vi.mocked(spawn).mock.calls.length === 0) {
						throw new Error("cloudflared not spawned yet");
					}
				});
				controller.abort();

				await expect(pendingHeaders).rejects.toMatchObject({
					name: "AbortError",
				});
				expect(fake.child.killed).toBe(true);
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
