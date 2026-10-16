import { describe, it } from "vitest";
import { normalizeAndValidateConfig } from "../../src/config/validation";
import type { ContainerApp } from "../../src/config/environment";

function validate(settings: Partial<ContainerApp>) {
	return normalizeAndValidateConfig(
		{
			name: "worker",
			durable_objects: {
				bindings: [{ name: "SANDBOX", class_name: "Sandbox" }],
			},
			migrations: [{ tag: "v1", new_sqlite_classes: ["Sandbox"] }],
			containers: [
				{
					class_name: "Sandbox",
					scheduling_policy: "durable_object",
					...settings,
				},
			],
		},
		undefined,
		undefined,
		{ env: undefined }
	);
}

describe("Durable Object application settings", () => {
	it.for([{ enabled: true }, { logs: { enabled: false } }])(
		"accepts explicit log settings %j and private flags",
		(observability, { expect }) => {
			const { diagnostics, config } = validate({
				observability,
				unsafe: { configuration: { experimental_flags: [] } },
			});
			expect(diagnostics.hasErrors()).toBe(false);
			expect(config.containers?.[0].observability).toEqual(observability);
			expect(config.containers?.[0].unsafe).toEqual({
				configuration: { experimental_flags: [] },
			});
		}
	);

	it.for([
		{ configuration: { experimental_flags: "flag" } },
		{ configuration: { experimental_flags: [1] } },
		{ configuration: null },
		{ configuration: { image: "not-supported" } },
		{ max_instances: 3 },
		{ observability: { logs: { enabled: true } } },
	])(
		"rejects unsupported or malformed private settings %j",
		(unsafe, { expect }) => {
			expect(validate({ unsafe }).diagnostics.hasErrors()).toBe(true);
		}
	);

	it.for([
		{ enabled: true, target_instance_count: 1 },
		{ enabled: true, target_instance_percentage: 100 },
		{ enabled: true, logs: { enabled: false } },
		{},
	])(
		"rejects unsupported or conflicting observability %j",
		(observability, { expect }) => {
			expect(validate({ observability }).diagnostics.hasErrors()).toBe(true);
		}
	);
});
