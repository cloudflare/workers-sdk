import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { detectAgent } from "../utils/detect-agent";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runWrangler } from "./helpers/run-wrangler";

vi.mock("../utils/detect-agent");

const mockDetectAgent = vi.mocked(detectAgent);

describe("wrangler dev --help", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	describe("when invoked by an agent", () => {
		beforeEach(() => {
			mockDetectAgent.mockReturnValue({
				isAgent: true,
				id: "claude-code",
			});
		});

		it("includes the Local Explorer API section", async ({ expect }) => {
			await runWrangler("dev --help");

			expect(std.out).toContain("LOCAL EXPLORER API");
			expect(std.out).toContain("http://localhost:<PORT>/cdn-cgi/explorer/api");
			expect(std.out).toContain("OpenAPI spec");
			expect(std.out).toContain("/api/local/workers");
			expect(std.out).toContain("/api/storage/kv/namespaces");
			expect(std.out).toContain("/api/d1/database");
			expect(std.out).toContain("/api/r2/buckets");
			expect(std.out).toContain("/api/workers/durable_objects/namespaces");
			expect(std.out).toContain("/api/workflows");
			expect(std.out).toContain("Cloudflare API envelope");
			expect(std.out).toContain("/cdn-cgi/explorer/api");
		});

		it("still includes the standard description", async ({ expect }) => {
			await runWrangler("dev --help");

			expect(std.out).toContain(
				"Start a local server for developing your Worker"
			);
		});

		it("shows the Local Explorer section after the options as an epilogue", async ({
			expect,
		}) => {
			await runWrangler("dev --help");

			const output = std.out;
			const optionsIndex = output.indexOf("OPTIONS");
			const explorerIndex = output.indexOf("LOCAL EXPLORER API");

			expect(optionsIndex).toBeGreaterThan(-1);
			expect(explorerIndex).toBeGreaterThan(optionsIndex);
		});
	});

	describe("when not invoked by an agent", () => {
		beforeEach(() => {
			mockDetectAgent.mockReturnValue({
				isAgent: false,
				id: null,
			});
		});

		it("does not include the Local Explorer API section", async ({
			expect,
		}) => {
			await runWrangler("dev --help");

			expect(std.out).not.toContain("LOCAL EXPLORER API");
			expect(std.out).not.toContain(
				"http://localhost:<PORT>/cdn-cgi/explorer/api"
			);
		});

		it("still includes the standard description", async ({ expect }) => {
			await runWrangler("dev --help");

			expect(std.out).toContain(
				"Start a local server for developing your Worker"
			);
		});
	});
});
