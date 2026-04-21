import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { spawnCloudflared } from "../src/cloudflared";
import { UserError } from "../src/errors";
import { startTunnel } from "../src/tunnel";

vi.mock("../src/cloudflared", () => {
	return {
		spawnCloudflared: vi.fn(),
	};
});

function createMockProcess() {
	const proc = new EventEmitter() as EventEmitter & {
		stderr: EventEmitter;
		stdout: EventEmitter;
		killed: boolean;
		kill: (signal?: string) => boolean;
	};
	proc.stderr = new EventEmitter();
	proc.stdout = new EventEmitter();
	proc.killed = false;
	proc.kill = () => {
		proc.killed = true;
		return true;
	};
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

		await emitStderrNextTick(
			proc,
			"2024-01-15T10:30:00Z INF | https://foo-bar-baz.trycloudflare.com |\n"
		);

		await expect(tunnel.ready()).resolves.toEqual({
			publicUrl: new URL("https://foo-bar-baz.trycloudflare.com"),
		});

		await tunnel.dispose();
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
		await tunnel.dispose();

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
			"The local dev server started at http://localhost:8787/."
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
			"The tunnel is still open at https://my-tunnel.trycloudflare.com. It expires in 1m. Press [t] to extend by 1 hour."
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
			"The tunnel is still open at https://my-tunnel.trycloudflare.com. It expires in 1m. "
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
