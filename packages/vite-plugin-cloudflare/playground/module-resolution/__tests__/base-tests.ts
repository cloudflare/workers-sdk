import { afterAll, describe, expect, test } from "vitest";
import {
	getJsonResponse,
	getTextResponse,
	isBuild,
	serverLogs,
} from "../../__test-utils__";

describe("module resolution", async () => {
	afterAll(() => {
		expect(serverLogs.errors).toEqual([]);
	});

	describe("basic module resolution", () => {
		test("`require` js/cjs files with specifying their file extension", async () => {
			const result = await getJsonResponse("/require-ext");
			expect(result).toEqual({
				"(requires/ext) hello.cjs (wrong-extension)": null,
				"(requires/ext) helloWorld": "hello (.js) world (.cjs)",
				"(requires/ext) world.js (wrong-extension)": null,
			});
		});

		test("`require` js/cjs files without specifying their file extension", async () => {
			const result = await getJsonResponse("/require-no-ext");
			expect(result).toEqual({
				"(requires/no-ext) helloWorld": "hello (.js) world (.cjs)",
			});
		});

		test("`require` json files", async () => {
			const result = await getJsonResponse("/require-json");
			expect(result).toEqual({
				"(requires/json) package name":
					"@playground/module-resolution-requires",
				"(requires/json) package version": "1.0.0",
			});
		});
	});

	describe("Cloudflare specific module resolution", () => {
		test("internal imports from `cloudflare:*`", async () => {
			const result = await getJsonResponse("/cloudflare-imports");

			// Note: in some cases the DurableObject class name (erroneously) includes
			//       the `Base` suffix, that's a workerd bug that happens for us on builds
			const durableObjectName = isBuild ? "DurableObjectBase" : "DurableObject";

			expect(result).toEqual({
				"(cloudflare:workers) WorkerEntrypoint.name": "WorkerEntrypoint",
				"(cloudflare:workers) DurableObject.name": durableObjectName,
				"(cloudflare:sockets) typeof connect": "function",
			});
		});

		test("external imports from `cloudflare:*`", async () => {
			const result = await getJsonResponse("/external-cloudflare-imports");

			// Note: in some cases the DurableObject class name (erroneously) includes
			//       the `Base` suffix, that's a workerd bug that happens for us on builds
			const durableObjectName = isBuild ? "DurableObjectBase" : "DurableObject";

			expect(result).toEqual({
				"(EXTERNAL) (cloudflare:workers) DurableObject.name": durableObjectName,
			});
		});
	});

	/**
	 *  These tests check that module resolution works as intended for various third party npm packages (these tests are more
	 *  realistic but less helpful than the other ones (these can be considered integration tests whilst the other unit tests)).
	 *
	 *  These are packages that involve non-trivial module resolutions (and that in the past we had issues with), they have no
	 *  special meaning to us.
	 */
	describe("third party packages resolutions", () => {
		test("react", async () => {
			const result = await getJsonResponse("/third-party/react");
			expect(result).toEqual({
				"(react) reactVersionsMatch": true,
				"(react) typeof React": "object",
				"(react) typeof React.cloneElement": "function",
			});
		});

		test("@remix-run/cloudflare", async () => {
			const result = await getJsonResponse("/third-party/remix");
			expect(result).toEqual({
				"(remix) remixRunCloudflareCookieName":
					"my-remix-run-cloudflare-cookie",
			});
		});

		test("discord-api-types/v10", async () => {
			const result = await getJsonResponse("/third-party/discord-api-types");
			expect(result).toEqual({
				"(discord-api-types/v10) RPCErrorCodes.InvalidUser": 4010,
				"(discord-api-types/v10) Utils.isLinkButton({})": false,
			});
		});

		test("slash-create", async () => {
			const result = await getJsonResponse("/third-party/slash-create");
			expect(result).toEqual({
				"(slash-create/web) VERSION": "6.2.1",
				"(slash-create/web) myCollection.random()": 54321,
				"(slash-create/web) slashCreatorInstance is instance of SlashCreator":
					true,
			});
		});
	});

	describe("user aliases", () => {
		test("imports from an aliased package", async () => {
			const result = await getTextResponse("/@alias/test");
			expect(result).toBe("OK!");
		});
	});

	describe("optimizeDeps.exclude", () => {
		test("supports excluded packages importing from virtual modules", async () => {
			const result = await getTextResponse("/optimize-deps/exclude");
			expect(result).toBe("Export from virtual module");
		});
	});
});
