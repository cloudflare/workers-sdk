import { InputConfigSchema, convertToWranglerConfig } from "@cloudflare/config";
import { mapWorkerMetadataBindings } from "@cloudflare/workers-utils";
import { describe, it } from "vitest";
import { getRemoteConfigDiff } from "../src/deploy/helpers/config-diffs";
import type { Config } from "@cloudflare/workers-utils";

/**
 * A `cloudflare.config.ts` whose worker binding targets a Worker deployed
 * against a legacy service environment (e.g. `environment: "production"`).
 */
function typedConfigWithEnvironment(environment: string) {
	return {
		worker: {
			name: "example-app",
			compatibilityDate: "2026-06-01",
			env: {
				EXAMPLE_RENDERER: {
					type: "worker",
					worker: "example-renderer",
					environment,
				},
			},
		},
		containers: [],
	};
}

/**
 * The live API metadata of an existing Worker whose service binding carries
 * the legacy target environment.
 */
function remoteMetadataWithEnvironment(environment: string) {
	return mapWorkerMetadataBindings([
		{
			type: "service",
			name: "EXAMPLE_RENDERER",
			service: "example-renderer",
			environment,
		},
	]);
}

describe("legacy service binding target environment", () => {
	it("does not flag a migrated binding with the same environment as destructive", ({
		expect,
	}) => {
		const local = convertToWranglerConfig(
			InputConfigSchema.parse(typedConfigWithEnvironment("production"))
		) as Config;
		const remote = remoteMetadataWithEnvironment("production");

		expect(getRemoteConfigDiff(remote, local)).toEqual({
			diff: null,
			nonDestructive: true,
		});
	});

	it("still flags a changed target environment as destructive", ({
		expect,
	}) => {
		const local = convertToWranglerConfig(
			InputConfigSchema.parse(typedConfigWithEnvironment("staging"))
		) as Config;
		const remote = remoteMetadataWithEnvironment("production");

		const result = getRemoteConfigDiff(remote, local);
		expect(result.diff).not.toBeNull();
		expect(result.nonDestructive).toBe(false);
	});
});
