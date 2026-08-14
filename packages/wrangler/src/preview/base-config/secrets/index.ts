import { CommandLineArgsError } from "@cloudflare/workers-utils";
import { createNamespace } from "../../../core/create-command";

export const previewBaseConfigSecretNamespace = createNamespace({
	metadata: {
		description: "Manage secrets on the Preview base config",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
});

export function rejectUnsupportedPreviewArgs(args: Record<string, unknown>) {
	for (const flag of ["name", "tag", "message"] as const) {
		if (args[flag] !== undefined) {
			throw new CommandLineArgsError(`Unknown argument: ${flag}`, {
				telemetryMessage: "preview base-config unsupported flag",
			});
		}
	}
	if (args.ignoreBaseConfig === true) {
		throw new CommandLineArgsError("Unknown argument: ignore-base-config", {
			telemetryMessage: "preview base-config unsupported flag",
		});
	}
}
