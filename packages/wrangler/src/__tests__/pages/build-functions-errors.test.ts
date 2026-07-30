import { UserError } from "@cloudflare/workers-utils";
import { beforeEach, describe, it, vi } from "vitest";
import { buildFunctions } from "../../pages/buildFunctions";
import { toUrlPath } from "../../paths";

const mocks = vi.hoisted(() => ({
	generateConfigFromFileTree: vi.fn(),
	writeRoutesModule: vi.fn(),
}));

vi.mock("@cloudflare/pages-functions", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/pages-functions")>()),
	generateConfigFromFileTree: mocks.generateConfigFromFileTree,
	writeRoutesModule: mocks.writeRoutesModule,
}));

describe("Pages Functions build error adapter", () => {
	beforeEach(() => {
		mocks.generateConfigFromFileTree.mockReset();
		mocks.writeRoutesModule.mockReset();
	});

	it("preserves unexpected route discovery errors", async ({ expect }) => {
		const error = new TypeError("unexpected route discovery failure");
		mocks.generateConfigFromFileTree.mockRejectedValue(error);

		let caughtError: unknown;
		try {
			await buildFunctions({
				functionsDirectory: "functions",
				local: true,
				defineNavigatorUserAgent: false,
				checkFetch: false,
			});
		} catch (caught) {
			caughtError = caught;
		}

		expect(caughtError).toBe(error);
		expect(caughtError).not.toBeInstanceOf(UserError);
	});

	it("preserves unexpected routes module errors", async ({ expect }) => {
		const error = new TypeError("unexpected routes module failure");
		mocks.generateConfigFromFileTree.mockResolvedValue({
			routes: [
				{
					routePath: toUrlPath("/"),
					mountPath: toUrlPath("/"),
					module: "index.ts:onRequest",
				},
			],
		});
		mocks.writeRoutesModule.mockRejectedValue(error);

		let caughtError: unknown;
		try {
			await buildFunctions({
				functionsDirectory: "functions",
				local: true,
				defineNavigatorUserAgent: false,
				checkFetch: false,
			});
		} catch (caught) {
			caughtError = caught;
		}

		expect(caughtError).toBe(error);
		expect(caughtError).not.toBeInstanceOf(UserError);
	});
});
