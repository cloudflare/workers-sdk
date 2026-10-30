import { afterEach, beforeEach, describe, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createServer: vi.fn(),
}));

vi.mock("vite", () => ({
	createServer: mocks.createServer,
	createBuilder: vi.fn(),
}));

const stopBeforeListening = new Error("stop before listening");
const originalArgv = process.argv;

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	vi.stubEnv("CLOUDFLARE_VITE_AUTH_PROFILE", undefined);
	vi.stubEnv("CLOUDFLARE_VITE_FORCE_LOCAL", undefined);
	vi.stubEnv("CLOUDFLARE_VITE_CLI_DISPLAY_NAME", undefined);
	mocks.createServer.mockRejectedValue(stopBeforeListening);
});

afterEach(() => {
	process.argv = originalArgv;
	vi.unstubAllEnvs();
});

describe("cf-vite dev", () => {
	it.for([{ argv: ["--profile", "work"] }, { argv: ["--profile=work"] }])(
		"forwards the profile before loading Vite config ($argv)",
		async ({ argv }, { expect }) => {
			process.argv = [
				"node",
				"cf-vite",
				"dev",
				...argv,
				"--mode",
				"production",
				"--port",
				"8788",
				"--host",
				"example.com",
				"--local",
			];
			mocks.createServer.mockImplementation(async () => {
				expect(process.env.CLOUDFLARE_VITE_AUTH_PROFILE).toBe("work");
				throw stopBeforeListening;
			});

			await expect(import("../cf-vite")).rejects.toBe(stopBeforeListening);

			expect(mocks.createServer).toHaveBeenCalledWith({
				mode: "production",
				server: { port: 8788, host: "example.com" },
			});
		}
	);

	it("leaves directory profile resolution enabled when --profile is omitted", async ({
		expect,
	}) => {
		process.argv = ["node", "cf-vite", "dev"];

		await expect(import("../cf-vite")).rejects.toBe(stopBeforeListening);

		expect(mocks.createServer).toHaveBeenCalledOnce();
		expect(process.env.CLOUDFLARE_VITE_AUTH_PROFILE).toBeUndefined();
	});

	it("rejects --profile without a value", async ({ expect }) => {
		process.argv = ["node", "cf-vite", "dev", "--profile"];
		vi.spyOn(process.stderr, "write").mockReturnValue(true);
		vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});

		await expect(import("../cf-vite")).rejects.toThrow("exit");

		expect(process.exit).toHaveBeenCalledWith(2);
		expect(mocks.createServer).not.toHaveBeenCalled();
	});
});
