import { stripVTControlCharacters } from "node:util";
import { printBindings } from "@cloudflare/workers-utils";
import { describe, test } from "vitest";
import type { Binding, PrintBindingsOptions } from "@cloudflare/workers-utils";

function captureBindings(
	bindings: Record<string, Binding>,
	options: Omit<PrintBindingsOptions, "log"> = {}
) {
	const output: string[] = [];
	printBindings(bindings, {
		...options,
		log: (message) => output.push(message),
	});
	return stripVTControlCharacters(output.join("\n"));
}

describe("printBindings", () => {
	test("prints a bindings table through the caller's logger", ({ expect }) => {
		const output = captureBindings({
			KV: { type: "kv_namespace", id: "test-kv-id" },
			SERVICE: { type: "service", service: "api-worker" },
		});

		expect(output).toContain(
			"Your Worker has access to the following bindings:"
		);
		expect(output).toContain("env.KV (test-kv-id)");
		expect(output).toContain("env.SERVICE (api-worker)");
	});

	test("accepts the structural subset of a Miniflare worker registry", ({
		expect,
	}) => {
		const output = captureBindings(
			{
				SERVICE: { type: "service", service: "api-worker" },
			},
			{
				local: true,
				registry: {
					"api-worker": { debugPortAddress: "127.0.0.1:9229" },
				},
			}
		);

		expect(output).toContain("local [connected]");
	});

	test("prints Durable Object-managed containers by class and policy", ({
		expect,
	}) => {
		const output = captureBindings(
			{},
			{
				containers: [
					{
						class_name: "Sandbox",
						scheduling_policy: "durable_object",
						images: {
							sandbox: { dockerfile: "./container/Dockerfile" },
						},
					},
				],
			}
		);

		expect(output).toContain(
			"The following containers are available:\n- Sandbox (durable_object)"
		);
		expect(output).not.toContain("undefined");
	});
});
