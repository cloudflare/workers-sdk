import { EventEmitter } from "node:events";
import {
	afterEach,
	beforeEach,
	describe,
	it,
	onTestFinished,
	vi,
} from "vitest";
import { fetchResultBase } from "../src/cfetch";
import { spawnCloudflared } from "../src/cloudflared";
import { UserError } from "../src/errors";
import { resolveNamedTunnel, startTunnel } from "../src/tunnel";

vi.mock("../src/cloudflared", () => {
	return {
		spawnCloudflared: vi.fn(),
	};
});

vi.mock("../src/cfetch", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/cfetch")>()),
	fetchResultBase: vi.fn(),
}));

function createMockProcess() {
	const proc = new EventEmitter() as EventEmitter & {
		stderr: EventEmitter;
		stdout: EventEmitter;
		killed: boolean;
		kill: (signal?: string) => boolean;
		unref: () => void;
	};
	proc.stderr = new EventEmitter();
	proc.stdout = new EventEmitter();
	proc.killed = false;
	proc.kill = () => {
		proc.killed = true;
		return true;
	};
	proc.unref = vi.fn();
	return proc;
}

function emitStderrNextTick(
	proc: ReturnType<typeof createMockProcess>,
	data: string
) {
	return new Promise<void>((resolve) => {
		process.nextTick(() => {
			proc.stderr.emit("data", Buffer.from(data));
			resolve();
		});
	});
}

function emitNextTick(
	proc: ReturnType<typeof createMockProcess>,
	event: string,
	...args: unknown[]
) {
	return new Promise<void>((resolve) => {
		process.nextTick(() => {
			proc.emit(event, ...args);
			resolve();
		});
	});
}

const TEST_TIMEOUT_MS = 60_000;

describe("startTunnel", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("should resolve with the public URL", async ({ expect }) => {
		const proc = createMockProcess();
		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
		});
		onTestFinished(() => tunnel.dispose());

		await emitStderrNextTick(
			proc,
			"2024-01-15T10:30:00Z INF | https://foo-bar-baz.trycloudflare.com |\n"
		);

		await expect(tunnel.ready()).resolves.toEqual({
			mode: "quick",
			publicUrl: new URL("https://foo-bar-baz.trycloudflare.com"),
		});
	});

	it("should resolve named tunnels after spawning cloudflared", async ({
		expect,
	}) => {
		const proc = createMockProcess();
		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			token: "NAMED_TUNNEL_TOKEN",
			timeoutMs: TEST_TIMEOUT_MS,
		});
		onTestFinished(() => tunnel.dispose());

		await expect(tunnel.ready()).resolves.toEqual({ mode: "named" });
	});

	it("should pass the correct args to spawnCloudflared", async ({ expect }) => {
		const proc = createMockProcess();
		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
		});

		await emitStderrNextTick(
			proc,
			"INF https://test-tunnel.trycloudflare.com\n"
		);
		await tunnel.ready();

		expect(spawnCloudflared).toHaveBeenCalledWith(
			["tunnel", "--no-autoupdate", "--url", "http://localhost:8787/"],
			{ stdio: "pipe", skipVersionCheck: true }
		);
	});

	it("should pass the correct args for named tunnels", async ({ expect }) => {
		const proc = createMockProcess();
		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			token: "NAMED_TUNNEL_TOKEN",
			timeoutMs: TEST_TIMEOUT_MS,
		});

		await tunnel.ready();

		expect(spawnCloudflared).toHaveBeenCalledWith(
			["tunnel", "--no-autoupdate", "run"],
			{
				env: { TUNNEL_TOKEN: "NAMED_TUNNEL_TOKEN" },
				stdio: "pipe",
				skipVersionCheck: true,
			}
		);
	});

	it("should reject if cloudflared exits before producing a URL", async ({
		expect,
	}) => {
		const proc = createMockProcess();
		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
		});

		await emitNextTick(proc, "exit", 1, null);

		await expect(() => tunnel.ready()).rejects.toThrow(
			"cloudflared exited with code 1 before the tunnel was ready"
		);
	});

	it("should reject if cloudflared is terminated by signal", async ({
		expect,
	}) => {
		const proc = createMockProcess();
		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
		});

		await emitNextTick(proc, "exit", null, "SIGTERM");

		await expect(tunnel.ready()).rejects.toThrow(
			"cloudflared terminated by signal SIGTERM before the tunnel was ready"
		);
	});

	it("should reject if cloudflared emits an error event", async ({
		expect,
	}) => {
		const proc = createMockProcess();
		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
		});

		await emitNextTick(proc, "error", new Error("spawn ENOENT"));

		await expect(tunnel.ready()).rejects.toThrow(
			"Failed to start cloudflared: spawn ENOENT"
		);
	});

	it("should reject on timeout if no URL appears", async ({ expect }) => {
		const proc = createMockProcess();
		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: 50,
		});
		const readyPromise = tunnel.ready();
		const timeoutAssertion = expect(readyPromise).rejects.toThrow(
			"Timed out waiting for cloudflared to start"
		);

		await vi.advanceTimersByTimeAsync(50);

		await timeoutAssertion;
	});

	it("should kill the cloudflared process on dispose", async ({ expect }) => {
		const proc = createMockProcess();
		const killSpy = vi.spyOn(proc, "kill");
		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
		});

		await emitStderrNextTick(proc, "INF https://my-tunnel.trycloudflare.com\n");
		await tunnel.ready();
		tunnel.dispose();

		expect(killSpy).toHaveBeenCalledWith("SIGTERM");
	});

	it("should detach the cloudflared process before dispose", async ({
		expect,
	}) => {
		const proc = createMockProcess();
		const unrefSpy = vi.spyOn(proc, "unref");
		const killSpy = vi.spyOn(proc, "kill");
		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
		});

		await emitStderrNextTick(proc, "INF https://my-tunnel.trycloudflare.com\n");
		await tunnel.ready();

		tunnel.dispose();

		expect(unrefSpy).toHaveBeenCalledTimes(1);
		expect(killSpy).toHaveBeenCalledWith("SIGTERM");
	});

	it("should terminate cloudflared when disposed before spawn resolves", async ({
		expect,
	}) => {
		const proc = createMockProcess();
		const unrefSpy = vi.spyOn(proc, "unref");
		const killSpy = vi.spyOn(proc, "kill");
		let resolveProcess:
			| ((value: ReturnType<typeof createMockProcess>) => void)
			| undefined;

		vi.mocked(spawnCloudflared).mockImplementation(
			() =>
				new Promise<ReturnType<typeof createMockProcess>>((resolve) => {
					resolveProcess = resolve;
				}) as never
		);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
		});

		tunnel.dispose();
		expect(unrefSpy).not.toHaveBeenCalled();
		expect(killSpy).not.toHaveBeenCalled();

		resolveProcess?.(proc);
		await Promise.resolve();

		expect(unrefSpy).toHaveBeenCalledTimes(1);
		expect(killSpy).toHaveBeenCalledWith("SIGTERM");
	});

	it("should handle URLs appearing across multiple chunks", async ({
		expect,
	}) => {
		const proc = createMockProcess();
		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
		});

		await emitStderrNextTick(proc, "INF https://split-");
		await emitStderrNextTick(proc, "url-tunnel.trycloudflare.com\n");

		await expect(tunnel.ready()).resolves.toEqual({
			mode: "quick",
			publicUrl: new URL("https://split-url-tunnel.trycloudflare.com"),
		});
	});

	it("should include cloudflared output in startup errors", async ({
		expect,
	}) => {
		const proc = createMockProcess();
		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
		});

		await emitStderrNextTick(proc, "some debug info\n");
		await emitNextTick(proc, "exit", 1, null);

		await expect(tunnel.ready()).rejects.toThrow("some debug info");
	});

	it("should surface rate limiting guidance for quick tunnels", async ({
		expect,
	}) => {
		const proc = createMockProcess();
		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
		});

		await emitStderrNextTick(
			proc,
			'ERR Error unmarshaling QuickTunnel response: error code: 1015 status_code="429 Too Many Requests"\n'
		);
		await emitNextTick(proc, "exit", 1, null);

		await expect(() => tunnel.ready()).rejects.toThrow(
			"Cloudflare Quick Tunnel creation was rate limited."
		);
		await expect(() => tunnel.ready()).rejects.toThrow(
			"The local dev server started at http://localhost:8787/"
		);
		await expect(() => tunnel.ready()).rejects.toBeInstanceOf(UserError);
	});

	it("should remind and expire tunnels when expiry timers are enabled", async ({
		expect,
	}) => {
		const proc = createMockProcess();
		const killSpy = vi.spyOn(proc, "kill");
		const logger = {
			log: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		};

		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
			expiryMs: 120_000,
			reminderIntervalMs: 60_000,
			extendHint: "Press [t] to extend by 1 hour.",
			logger,
		});

		await emitStderrNextTick(proc, "INF https://my-tunnel.trycloudflare.com\n");
		await tunnel.ready();

		await vi.advanceTimersByTimeAsync(60_000);
		expect(logger.log).toHaveBeenCalledWith(
			"Tunnel still open, expires in 1m: https://my-tunnel.trycloudflare.com Press [t] to extend by 1 hour."
		);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(logger.log).toHaveBeenCalledWith("Tunnel expired. Closing tunnel.");
		expect(killSpy).toHaveBeenCalledWith("SIGTERM");
	});

	it("should extend tunnel expiry when requested", async ({ expect }) => {
		const proc = createMockProcess();
		const killSpy = vi.spyOn(proc, "kill");
		const logger = {
			log: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		};

		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
			expiryMs: 120_000,
			reminderIntervalMs: 60_000,
			logger,
		});

		await emitStderrNextTick(proc, "INF https://my-tunnel.trycloudflare.com\n");
		await tunnel.ready();

		await vi.advanceTimersByTimeAsync(60_000);
		tunnel.extendExpiry(60_000);
		const expectedExpiryTime = new Intl.DateTimeFormat(undefined, {
			timeStyle: "short",
		}).format(new Date(Date.now() + 120_000));

		await vi.advanceTimersByTimeAsync(60_000);
		expect(logger.log).toHaveBeenCalledWith(
			`Tunnel expiry extended by 1m. It now expires at ${expectedExpiryTime}.`
		);
		expect(killSpy).not.toHaveBeenCalled();
		expect(logger.log).toHaveBeenCalledWith(
			"Tunnel still open, expires in 1m: https://my-tunnel.trycloudflare.com"
		);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(logger.log).toHaveBeenCalledWith("Tunnel expired. Closing tunnel.");
		expect(killSpy).toHaveBeenCalledWith("SIGTERM");
	});

	it("should cap the tunnel to 3h of remaining time", async ({ expect }) => {
		const proc = createMockProcess();
		const killSpy = vi.spyOn(proc, "kill");
		const logger = {
			log: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
		};

		vi.mocked(spawnCloudflared).mockResolvedValue(proc as never);

		const tunnel = startTunnel({
			origin: new URL("http://localhost:8787"),
			timeoutMs: TEST_TIMEOUT_MS,
			reminderIntervalMs: 0,
			logger,
		});

		await emitStderrNextTick(proc, "INF https://my-tunnel.trycloudflare.com\n");
		await tunnel.ready();
		tunnel.extendExpiry();
		tunnel.extendExpiry();
		const cappedExpiryTime = new Intl.DateTimeFormat(undefined, {
			timeStyle: "short",
		}).format(new Date(Date.now() + 3 * 60 * 60 * 1_000));

		expect(logger.log).toHaveBeenCalledWith(
			`Tunnel expiry extended by 1h. It now expires at ${cappedExpiryTime}.`
		);

		tunnel.extendExpiry();

		expect(logger.log).toHaveBeenCalledWith(
			`Tunnel expiry extended to the 3h limit. It now expires at ${cappedExpiryTime}.`
		);

		await vi.advanceTimersByTimeAsync(60 * 60 * 1_000);
		tunnel.extendExpiry();
		const extendedAgainExpiryTime = new Intl.DateTimeFormat(undefined, {
			timeStyle: "short",
		}).format(new Date(Date.now() + 3 * 60 * 60 * 1_000));

		expect(logger.log).toHaveBeenCalledWith(
			`Tunnel expiry extended by 1h. It now expires at ${extendedAgainExpiryTime}.`
		);

		await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1_000);
		expect(logger.log).toHaveBeenCalledWith("Tunnel expired. Closing tunnel.");
		expect(killSpy).toHaveBeenCalledWith("SIGTERM");
	});
});

describe("resolveNamedTunnel", () => {
	it("resolves matching ingress hostnames and the tunnel token", async ({
		expect,
	}) => {
		vi.mocked(fetchResultBase)
			.mockResolvedValueOnce([
				{
					id: "11111111-1111-4111-8111-111111111111",
					name: "my-tunnel",
				},
			])
			.mockResolvedValueOnce({
				config: {
					ingress: [
						{
							hostname: "dev.example.com",
							service: "http://127.0.0.1:8787",
						},
						{
							hostname: "other.example.com",
							service: "http://localhost:3000",
						},
					],
				},
			})
			.mockResolvedValueOnce("TOKEN");
		const abortSignal = new AbortController().signal;
		await expect(
			resolveNamedTunnel("my-tunnel", new URL("http://localhost:8787"), {
				abortSignal,
				accountId: "account",
				apiToken: { apiToken: "test-token" },
				complianceRegion: undefined,
				logger: console,
				userAgent: "test",
			})
		).resolves.toEqual({
			hostnames: ["dev.example.com"],
			token: "TOKEN",
		});
		expect(
			vi.mocked(fetchResultBase).mock.calls.map((call) => call[6])
		).toEqual([abortSignal, abortSignal, abortSignal]);
	});

	it("throws when a named tunnel has no ingress for the local port", async ({
		expect,
	}) => {
		vi.mocked(fetchResultBase)
			.mockResolvedValueOnce([{ id: "test-tunnel-id", name: "my-tunnel" }])
			.mockResolvedValueOnce({
				config: {
					ingress: [
						{
							hostname: "dev.example.com",
							service: "http://localhost:3000",
						},
						{
							hostname: "admin.example.com",
							service: "http://localhost:4000",
						},
					],
				},
			});

		await expect(
			resolveNamedTunnel("my-tunnel", new URL("http://localhost:8787"), {
				accountId: "test-account-id",
				apiToken: { apiToken: "test-token" },
				complianceRegion: undefined,
				logger: console,
				userAgent: "test",
			})
		).rejects.toThrowErrorMatchingInlineSnapshot(`
			[Error: Tunnel "my-tunnel" has no route for http://localhost:8787/

			Resolved routes:
			  - dev.example.com -> http://localhost:3000
			  - admin.example.com -> http://localhost:4000

			Update your local server settings or the tunnel routes in the Cloudflare dashboard:
			https://dash.cloudflare.com/test-account-id/tunnels/test-tunnel-id
			]
		`);
	});

	it("shows compact setup guidance when a named tunnel has no ingress rules", async ({
		expect,
	}) => {
		vi.mocked(fetchResultBase)
			.mockResolvedValueOnce([{ id: "test-tunnel-id", name: "my-tunnel" }])
			.mockResolvedValueOnce({ config: { ingress: [] } });

		await expect(
			resolveNamedTunnel("my-tunnel", new URL("http://localhost:8787"), {
				accountId: "test-account-id",
				apiToken: { apiToken: "test-token" },
				complianceRegion: undefined,
				logger: console,
				userAgent: "test",
			})
		).rejects.toThrowErrorMatchingInlineSnapshot(`
			[Error: Tunnel "my-tunnel" has no routes configured.

			Add a route for http://localhost:8787/ in the Cloudflare dashboard:
			https://dash.cloudflare.com/test-account-id/tunnels/test-tunnel-id
			]
		`);
	});
});
