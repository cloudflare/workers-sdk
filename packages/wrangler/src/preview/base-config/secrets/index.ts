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
	for (const [key, flag] of [
		["name", "name"],
		["tag", "tag"],
		["message", "message"],
	] as const) {
		if (args[key] !== undefined) {
			throw new CommandLineArgsError(`Unknown argument: ${flag}`, {
				telemetryMessage: "preview base-config unsupported flag",
			});
		}
	}
	if (args.ignoreDefaults === true) {
		throw new CommandLineArgsError("Unknown argument: ignore-defaults", {
			telemetryMessage: "preview base-config unsupported flag",
		});
	}
}
