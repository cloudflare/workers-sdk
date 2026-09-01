import { CommandLineArgsError } from "@cloudflare/workers-utils";
import { createNamespace } from "../../../core/create-command";
import { confirm } from "../../../dialogs";

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

export async function shouldPatchExistingPreviews(
	patchExistingPreviews: boolean | undefined,
	skipPrompt = false
) {
	return (
		patchExistingPreviews ??
		(!skipPrompt && process.stdin.isTTY
			? await confirm("Apply this update to existing Previews?", {
					defaultValue: false,
					fallbackValue: false,
				})
			: false)
	);
}
