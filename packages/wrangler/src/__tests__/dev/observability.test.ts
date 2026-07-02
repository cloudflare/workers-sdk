import {
	OBSERVABILITY_COLLECTOR_SERVICE_NAME,
	OBSERVABILITY_D1_BINDING,
} from "@cloudflare/workers-utils";
import { afterEach, describe, test, vi } from "vitest";
import { buildMiniflareBindingOptions } from "../../dev/miniflare";

// The experimental local-observability feature is gated behind the
// X_LOCAL_OBSERVABILITY env var. When enabled, `wrangler dev` wires the user
// worker's tail stream to the internal collector and provisions the internal
// WOBS_TRACES D1 store. These tests assert that gating at the option-builder
// level (the unit that actually adds the wiring).

function baseConfig() {
	return {
		name: "test-worker",
		bindings: {},
	} as unknown as Parameters<typeof buildMiniflareBindingOptions>[0];
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("buildMiniflareBindingOptions — local observability gate", () => {
	test("adds no collector wiring when X_LOCAL_OBSERVABILITY is unset", ({
		expect,
	}) => {
		const { bindingOptions } = buildMiniflareBindingOptions(
			baseConfig(),
			undefined
		);
		expect(bindingOptions.streamingTails ?? []).not.toContainEqual({
			name: OBSERVABILITY_COLLECTOR_SERVICE_NAME,
		});
		expect(bindingOptions.d1Databases ?? {}).not.toHaveProperty(
			OBSERVABILITY_D1_BINDING
		);
	});

	test("adds the collector streamingTail + internal D1 when enabled", ({
		expect,
	}) => {
		vi.stubEnv("X_LOCAL_OBSERVABILITY", "true");
		const { bindingOptions } = buildMiniflareBindingOptions(
			baseConfig(),
			undefined
		);
		expect(bindingOptions.streamingTails).toContainEqual({
			name: OBSERVABILITY_COLLECTOR_SERVICE_NAME,
		});
		expect(bindingOptions.d1Databases).toHaveProperty(OBSERVABILITY_D1_BINDING);
	});

	test("preserves user-defined streamingTails when enabled", ({ expect }) => {
		vi.stubEnv("X_LOCAL_OBSERVABILITY", "true");
		const config = baseConfig();
		config.streamingTails = [{ service: "my-tail" }];
		const { bindingOptions } = buildMiniflareBindingOptions(config, undefined);
		expect(bindingOptions.streamingTails).toContainEqual({ name: "my-tail" });
		expect(bindingOptions.streamingTails).toContainEqual({
			name: OBSERVABILITY_COLLECTOR_SERVICE_NAME,
		});
	});

	test("X_LOCAL_OBSERVABILITY=false behaves like unset", ({ expect }) => {
		vi.stubEnv("X_LOCAL_OBSERVABILITY", "false");
		const { bindingOptions } = buildMiniflareBindingOptions(
			baseConfig(),
			undefined
		);
		expect(bindingOptions.streamingTails ?? []).not.toContainEqual({
			name: OBSERVABILITY_COLLECTOR_SERVICE_NAME,
		});
		expect(bindingOptions.d1Databases ?? {}).not.toHaveProperty(
			OBSERVABILITY_D1_BINDING
		);
	});
});
