import {
	compatDateFlag,
	getLatestTypesEntrypoint,
	getWorkerdCompatibilityDate,
} from "helpers/compatDate";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it, test, vi } from "vitest";
import { createTestContext } from "../../__tests__/helpers";
import { mockSpinner, mockWorkersTypesDirectory } from "./mocks";

vi.mock("helpers/files");
vi.mock("fs");
vi.mock("@cloudflare/cli/interactive");

describe("Compatibility Date Helpers", () => {
	const originalDispatcher = getGlobalDispatcher();
	let agent: MockAgent;
	let spinner: ReturnType<typeof mockSpinner>;

	beforeEach(() => {
		spinner = mockSpinner();

		// Mock out the undici Agent
		agent = new MockAgent();
		agent.disableNetConnect();
		setGlobalDispatcher(agent);
	});

	afterEach(() => {
		agent.assertNoPendingInterceptors();
		setGlobalDispatcher(originalDispatcher);
		vi.useRealTimers();
	});

	const mockRegistryFetch = (latest: string) => {
		agent
			.get("https://registry.npmjs.org")
			.intercept({ path: "/workerd" })
			.reply(
				200,
				JSON.stringify({
					"dist-tags": { latest },
				}),
			);
	};

	describe("getWorkerdCompatibilityDate()", () => {
		test("normal flow", async () => {
			mockRegistryFetch("2.20250110.5");

			const date = await getWorkerdCompatibilityDate();

			const expectedDate = "2025-01-10";
			expect(date).toBe(expectedDate);
			expect(spinner.start).toHaveBeenCalled();
			expect(spinner.stop).toHaveBeenCalledWith(
				expect.stringContaining(expectedDate),
			);
		});

		test("empty result", async () => {
			mockRegistryFetch("");

			const date = await getWorkerdCompatibilityDate();

			const fallbackDate = "2024-11-11";
			expect(date).toBe(fallbackDate);
			expect(spinner.start).toHaveBeenCalled();
			expect(spinner.stop).toHaveBeenCalledWith(
				expect.stringContaining(fallbackDate),
			);
		});

		test("command failed", async () => {
			agent
				.get("https://registry.npmjs.org")
				.intercept({ path: "/workerd" })
				.replyWithError(new Error("Unknown error"));

			const date = await getWorkerdCompatibilityDate();

			const fallbackDate = "2024-11-11";
			expect(date).toBe(fallbackDate);
			expect(spinner.start).toHaveBeenCalled();
			expect(spinner.stop).toHaveBeenCalledWith(
				expect.stringContaining(fallbackDate),
			);
		});

		it("should use today's date if workerd's release is in the future", async () => {
			vi.setSystemTime("2025-01-09T23:59:59.999Z");
			mockRegistryFetch("2.20250110.5");

			const date = await getWorkerdCompatibilityDate();

			// should get back today because deploy will fail with a future date
			const expectedDate = "2025-01-09";
			expect(date).toBe(expectedDate);
			expect(spinner.start).toHaveBeenCalled();
			expect(spinner.stop).toHaveBeenCalledWith(
				expect.stringContaining(expectedDate),
			);
		});
	});

	test("compatDateFlag", async () => {
		mockRegistryFetch("2.20250110.5");

		const flag = await compatDateFlag();
		expect(flag).toBe("--compatibility-date=2025-01-10");
	});

	describe("getLatestTypesEntrypoint", () => {
		const ctx = createTestContext();

		test("happy path", async () => {
			mockWorkersTypesDirectory();

			const entrypoint = getLatestTypesEntrypoint(ctx);
			expect(entrypoint).toBe("2023-07-01");
		});

		test("read error", async () => {
			mockWorkersTypesDirectory(() => {
				throw new Error("ENOENT: no such file or directory");
			});

			const entrypoint = getLatestTypesEntrypoint(ctx);
			expect(entrypoint).toBe(null);
		});

		test("empty directory", async () => {
			mockWorkersTypesDirectory(() => []);

			const entrypoint = getLatestTypesEntrypoint(ctx);
			expect(entrypoint).toBe(null);
		});

		test("no compat dates found", async () => {
			mockWorkersTypesDirectory(() => ["foo", "bar"]);

			const entrypoint = getLatestTypesEntrypoint(ctx);
			expect(entrypoint).toBe(null);
		});
	});
});
