import { EventEmitter } from "node:events";
import { afterEach, describe, it, vi } from "vitest";
import { spawnCloudflared } from "../src/cloudflared";
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
	afterEach(() => {
		vi.restoreAllMocks();
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

		await expect(tunnel.ready()).rejects.toThrow(
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

		await expect(tunnel.ready()).rejects.toThrow(
			"Timed out waiting for cloudflared to start"
		);
	});

	it("should kill the cloudflared process on dispose", async ({ expect }) => {
		const proc = createMockProcess();
		const killSpy = vi.fn(() => {
			proc.killed = true;
			return true;
		});
		proc.kill = killSpy;
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
});
