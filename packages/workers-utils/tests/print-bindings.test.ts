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

	test("labels RealtimeKit bindings as remote when `remote: true` is set", ({
		expect,
	}) => {
		const output = captureBindings(
			{
				RTK: {
					type: "realtimekit",
					app_id: "2da1c5c6-8e8f-4119-b89e-18558e051486",
					remote: true,
				},
			},
			{ local: true }
		);

		expect(output).toMatch(
			/env\.RTK \(2da1c5c6-8e8f-4119-b89e-18558e051486\)\s+RealtimeKit\s+remote/
		);
	});

	test("labels RealtimeKit bindings as unsupported without `remote: true`", ({
		expect,
	}) => {
		const output = captureBindings(
			{
				RTK: {
					type: "realtimekit",
					app_id: "2da1c5c6-8e8f-4119-b89e-18558e051486",
				},
			},
			{ local: true }
		);

		expect(output).toMatch(
			/env\.RTK \(2da1c5c6-8e8f-4119-b89e-18558e051486\)\s+RealtimeKit\s+not supported/
		);
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

	test("prints OIDC token bindings with their audience and alg", ({
		expect,
	}) => {
		const output = captureBindings({
			API_TOKEN: { type: "oidc_token", audience: "https://api.example.com" },
			RSA_TOKEN: {
				type: "oidc_token",
				audience: "api://token-exchange",
				alg: "RS256",
			},
		});

		expect(output).toMatch(
			/env\.API_TOKEN \(https:\/\/api\.example\.com\)\s+OIDC Token/
		);
		expect(output).toMatch(
			/env\.RSA_TOKEN \(api:\/\/token-exchange, RS256\)\s+OIDC Token/
		);
	});

	test.for([false, true])(
		"labels OIDC token bindings as unsupported in local development with remote bindings disabled=%s",
		(remoteBindingsDisabled, { expect }) => {
			const output = captureBindings(
				{
					API_TOKEN: {
						type: "oidc_token",
						audience: "https://api.example.com",
					},
				},
				{ local: true, remoteBindingsDisabled }
			);

			expect(output).toMatch(/OIDC Token\s+not supported/);
		}
	);

	test.for([
		{ label: "default", remote: undefined, disabled: false, mode: "local" },
		{ label: "explicit local", remote: false, disabled: false, mode: "local" },
		{ label: "explicit remote", remote: true, disabled: false, mode: "remote" },
		{
			label: "default, remote disabled",
			remote: undefined,
			disabled: true,
			mode: "local",
		},
		{
			label: "explicit remote, remote disabled",
			remote: true,
			disabled: true,
			mode: "local",
		},
	])(
		"labels Artifacts bindings as $mode for $label",
		({ remote, disabled, mode }, { expect }) => {
			const output = captureBindings(
				{
					REPOS: {
						type: "artifacts",
						namespace: "review",
						...(remote === undefined ? {} : { remote }),
					},
				},
				{ local: true, remoteBindingsDisabled: disabled }
			);
			expect(output).toMatch(
				new RegExp(`env\\.REPOS \\(review\\)\\s+Artifacts\\s+${mode}`)
			);
		}
	);

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
