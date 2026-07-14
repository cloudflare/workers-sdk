import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { createRemoteBindingsAuth } from "./auth";
import type { RemoteBindingsLogger } from "./logger";

const mocks = vi.hoisted(() => ({
	cfAuth: { source: "cf" },
	wranglerAuth: { source: "wrangler" },
	createCfAuth: vi.fn(),
	createWranglerAuth: vi.fn(),
}));

vi.mock("@cloudflare/workers-auth/cf", () => ({
	createCfAuth: mocks.createCfAuth.mockReturnValue(mocks.cfAuth),
}));

vi.mock("@cloudflare/workers-auth/wrangler", () => ({
	createWranglerAuth: mocks.createWranglerAuth.mockReturnValue(
		mocks.wranglerAuth
	),
}));

const originalCfAuth = process.env.CLOUDFLARE_CF_AUTH;

function createTestLogger(): RemoteBindingsLogger {
	return {
		loggerLevel: "log",
		debug: vi.fn(),
		log: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		once: {
			info: vi.fn(),
			log: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
	};
}

describe("createRemoteBindingsAuth", () => {
	beforeEach(() => {
		delete process.env.CLOUDFLARE_CF_AUTH;
	});

	afterEach(() => {
		vi.clearAllMocks();
		if (originalCfAuth === undefined) {
			delete process.env.CLOUDFLARE_CF_AUTH;
		} else {
			process.env.CLOUDFLARE_CF_AUTH = originalCfAuth;
		}
	});

	it("uses Wrangler auth by default", ({ expect }) => {
		const result = createRemoteBindingsAuth(createTestLogger());

		expect(result).toEqual({ auth: mocks.wranglerAuth, useCfAuth: false });
		expect(mocks.createWranglerAuth).toHaveBeenCalledOnce();
		expect(mocks.createCfAuth).not.toHaveBeenCalled();
	});

	it("uses CF auth when CLOUDFLARE_CF_AUTH is present", ({ expect }) => {
		process.env.CLOUDFLARE_CF_AUTH = "";

		const result = createRemoteBindingsAuth(createTestLogger());

		expect(result).toEqual({ auth: mocks.cfAuth, useCfAuth: true });
		expect(mocks.createCfAuth).toHaveBeenCalledOnce();
		expect(mocks.createWranglerAuth).not.toHaveBeenCalled();
	});
});
