import { describe, test } from "vitest";
import { getJsonResponse, getResponse, isBuild } from "../../../__test-utils__";

describe.skipIf(isBuild)("entrypoint routing", () => {
	test("routes to worker-a entrypoint via {entrypoint}.{worker}.localhost", async ({
		expect,
	}) => {
		const result = await getJsonResponse("/", "greet.worker-a.localhost");
		expect(result).toEqual({ name: "Hello from Named entrypoint" });
	});

	test("routes to worker-b entrypoint", async ({ expect }) => {
		const result = await getJsonResponse(
			"/",
			"namedentrypoint.worker-b.localhost"
		);
		expect(result).toEqual({ name: "Worker B: Named entrypoint" });
	});

	test("{worker}.localhost routes to default entrypoint", async ({
		expect,
	}) => {
		const result = await getJsonResponse("/", "worker-a.localhost");
		expect(result).toEqual({ name: "Worker A" });
	});

	test("plain localhost falls through to default", async ({ expect }) => {
		const result = await getJsonResponse("/");
		expect(result).toEqual({ name: "Worker A" });
	});

	test("returns 404 for unknown worker via single-level subdomain", async ({
		expect,
	}) => {
		const response = await getResponse("/", "greet.localhost");
		expect(response.status()).toBe(404);
	});

	test("returns 404 for unknown worker", async ({ expect }) => {
		const response = await getResponse("/", "greet.unknown.localhost");
		expect(response.status()).toBe(404);
	});

	test("returns 404 for unknown entrypoint on known worker", async ({
		expect,
	}) => {
		const response = await getResponse("/", "nonexistent.worker-a.localhost");
		expect(response.status()).toBe(404);
	});
});
