import module from "node:module";
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLatestWorkerdCompatibilityDate } from "../src/compatibility-date";

describe("getLatestWorkerdCompatibilityDate", () => {
	beforeEach(() => {
		vi.setSystemTime(vi.getRealSystemTime());
	});

	describe("local", () => {
		it("should successfully get the local latest compatibility date from the local workerd instance", () => {
			// Note: this works because the function gets the monorepo's miniflare/workerd instance
			const { date, source } = getLatestWorkerdCompatibilityDate();
			expect(date).toMatch(/\d{4}-\d{2}-\d{2}/);
			expect(source).toEqual("local-workerd");
		});

		it("should fallback to the fallback date if it fails to get the date from a local workerd instance", () => {
			vi.spyOn(module, "createRequire").mockImplementation(
				// This breaks the require function that createRequire generate, causing us not to find
				// the local miniflare/workerd instance
				() => ({}) as NodeJS.Require
			);
			const { date, source } = getLatestWorkerdCompatibilityDate();
			const fallbackCompatDate = "2025-09-27";
			expect(date).toEqual(fallbackCompatDate);
			expect(source).toEqual("fallback");
		});

		it("should use today's date if the local workerd's date is in the future", async () => {
			vi.setSystemTime("2025-01-09T23:59:59.999Z");
			vi.spyOn(module, "createRequire").mockImplementation(() => {
				const mockedRequire = ((pkg: string) => {
					if (pkg === "workerd") {
						return { compatibilityDate: "2025-01-10" };
					}
					return {};
				}) as NodeJS.Require;
				mockedRequire.resolve = (() => "") as unknown as NodeJS.RequireResolve;
				return mockedRequire;
			});
			const { date, source } = getLatestWorkerdCompatibilityDate();
			const fallbackCompatDate = "2025-01-09";
			expect(date).toEqual(fallbackCompatDate);
			expect(source).toEqual("today");
		});
	});

	describe("remote", () => {
		const originalDispatcher = getGlobalDispatcher();
		let agent: MockAgent;
		beforeEach(() => {
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

		function mockRegistryFetch(latest: string) {
			agent
				.get("https://registry.npmjs.org")
				.intercept({ path: "/workerd" })
				.reply(
					200,
					JSON.stringify({
						"dist-tags": { latest },
					})
				);
		}

		it("should successfully get the latest compatibility date from the remote workerd instance", async () => {
			mockRegistryFetch("2.20250110.5");

			const { date, source } = await getLatestWorkerdCompatibilityDate({
				remote: true,
			});
			expect(date).toEqual("2025-01-10");
			expect(source).toEqual("remote-workerd");
		});

		it("should use today's date if the remote workerd's date is in the future", async () => {
			vi.setSystemTime("2025-01-09T23:59:59.999Z");
			mockRegistryFetch("2.20250110.5");

			const { date, source } = await getLatestWorkerdCompatibilityDate({
				remote: true,
			});
			expect(date).toEqual("2025-01-09");
			expect(source).toEqual("today");
		});

		it("should fallback to the fallback date if it fails to get the date from the remote npm workerd package", async () => {
			mockRegistryFetch("");

			const { date, source } = await getLatestWorkerdCompatibilityDate({
				remote: true,
			});
			const fallbackCompatDate = "2025-09-27";
			expect(date).toEqual(fallbackCompatDate);
			expect(source).toEqual("fallback");
		});
	});
});
