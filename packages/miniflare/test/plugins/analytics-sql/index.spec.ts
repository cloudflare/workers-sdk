import { ANALYTICS_SQL_PLUGIN, ProxyNodeBinding } from "miniflare";
import { describe, test } from "vitest";

function workerOptions(bindings = true) {
	return {
		config: {
			env: bindings ? { ANALYTICS: { type: "analytics" } } : {},
		},
	} as unknown as Parameters<typeof ANALYTICS_SQL_PLUGIN.getBindings>[0];
}

describe("Analytics SQL plugin", () => {
	test("creates a service binding for the configured binding", async ({
		expect,
	}) => {
		const bindings = await ANALYTICS_SQL_PLUGIN.getBindings(
			workerOptions(),
			{} as Parameters<typeof ANALYTICS_SQL_PLUGIN.getBindings>[1],
			0
		);

		expect(bindings).toEqual([
			expect.objectContaining({
				name: "ANALYTICS",
				service: expect.objectContaining({ name: "analytics-sql:remote" }),
			}),
		]);
	});

	test("creates Node proxy bindings", async ({ expect }) => {
		const bindings =
			await ANALYTICS_SQL_PLUGIN.getNodeBindings(workerOptions());

		expect(Object.keys(bindings)).toEqual(["ANALYTICS"]);
		expect(bindings.ANALYTICS).toBeInstanceOf(ProxyNodeBinding);
	});

	test("creates the remote service only when configured", async ({
		expect,
	}) => {
		const services = await ANALYTICS_SQL_PLUGIN.getServices({
			options: workerOptions(),
		} as Parameters<typeof ANALYTICS_SQL_PLUGIN.getServices>[0]);
		const emptyServices = await ANALYTICS_SQL_PLUGIN.getServices({
			options: workerOptions(false),
		} as Parameters<typeof ANALYTICS_SQL_PLUGIN.getServices>[0]);

		expect(services).toEqual([
			expect.objectContaining({
				name: "analytics-sql:remote",
				worker: expect.objectContaining({
					compatibilityDate: "2025-01-01",
				}),
			}),
		]);
		expect(emptyServices).toEqual([]);
	});
});
