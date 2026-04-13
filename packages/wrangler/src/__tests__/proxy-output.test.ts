import { beforeEach, describe, it, vi } from "vitest";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("proxy startup output", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.resetModules();
	});

	it("keeps JSON output parseable when a proxy is configured", async ({
		expect,
	}) => {
		vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:8080");
		vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-api-token");

		const { main } = await import("../index");

		await main(["auth", "token", "--json"]);

		expect(std.out).not.toContain("Proxy environment variables detected");
		expect(JSON.parse(std.out)).toEqual({
			type: "api_token",
			token: "env-api-token",
		});
		expect(std.warn).toContain(
			"Proxy environment variables detected. We'll use your proxy for fetch requests."
		);
	});
});
