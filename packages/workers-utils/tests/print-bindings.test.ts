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

	test.for([undefined, true])(
		"labels K2 bindings as remote in local development with remote=%s",
		(remote, { expect }) => {
			const output = captureBindings(
				{
					ORDERS: {
						type: "k2",
						stream: "0123456789abcdef0123456789abcdef",
						...(remote === undefined ? {} : { remote }),
					},
				},
				{ local: true }
			);

			expect(output).toMatch(
				/env\.ORDERS \(0123456789abcdef0123456789abcdef\)\s+K2 Stream\s+remote/
			);
		}
	);

	test("labels K2 bindings as unsupported when remote bindings are disabled", ({
		expect,
	}) => {
		const output = captureBindings(
			{
				ORDERS: { type: "k2", stream: "0123456789abcdef0123456789abcdef" },
			},
			{ local: true, remoteBindingsDisabled: true }
		);

		expect(output).toMatch(/K2 Stream\s+not supported/);
	});

	test.for([{ class_name: "Sandbox" }, { name: "Sandbox" }])(
		"prints Durable Object-managed containers using their configured identity %j",
		(identity, { expect }) => {
			const output = captureBindings(
				{},
				{
					containers: [
						{
							...identity,
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
		}
	);
});
