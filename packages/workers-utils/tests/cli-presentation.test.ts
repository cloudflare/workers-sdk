import { describe, it } from "vitest";
import {
	CF_CLI_PRESENTATION,
	resolveCliPresentation,
} from "../src/cli-presentation";

describe("resolveCliPresentation", () => {
	it("defaults to Wrangler copy", ({ expect }) => {
		const presentation = resolveCliPresentation();

		expect(presentation).toMatchObject({
			cliName: "wrangler",
			displayName: "Wrangler",
			displayConfigFileName: "Wrangler config file",
			configFieldAssignmentSeparator: " = ",
			configFields: {
				workersDev: "workers_dev",
				containerObservabilityTargetPercentage: "target_instance_percentage",
				containerObservabilityTargetCount: "target_instance_count",
			},
			commands: {
				deploy: "wrangler deploy",
				versionsDeploy: "wrangler versions deploy",
			},
		});
		expect(presentation.commands.versionsDeployAt(25)).toBe(
			"wrangler versions deploy <new-version-id>@25%"
		);
	});

	it("uses cf commands while retaining unsupported Wrangler fallbacks", ({
		expect,
	}) => {
		const presentation = resolveCliPresentation(CF_CLI_PRESENTATION);

		expect(presentation).toMatchObject({
			cliName: "cf",
			displayName: "cf",
			displayConfigFileName: "cloudflare.config.ts",
			configFieldAssignmentSeparator: ": ",
			configFields: {
				workersDev: "workersDev",
				containerObservabilityTargetPercentage: "targetInstancePercentage",
				containerObservabilityTargetCount: "targetInstanceCount",
			},
			commands: {
				deploy: "cf deploy",
				preview: "cf previews deploy",
				versionsUpload: "cf workers versions create",
				versionsDeploy: "cf workers deployments create",
				secretPut: "cf workers secrets update",
				containerRegistryConfigure: "cf containers registries create",
			},
		});
		expect(presentation.commands.versionsDeployAt(25)).toBe(
			`cf workers deployments create --worker <worker-name> --strategy percentage --versions '[{"version_id":"<new-version-id>","percentage":25}]'`
		);
	});
});
