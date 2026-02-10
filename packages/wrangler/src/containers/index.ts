import { createNamespace } from "../core/create-command";

export const containersScope = "containers:write" as const;

// --- Namespace definition ---
export const containersNamespace = createNamespace({
	metadata: {
		description: "📦 Manage Containers",
		status: "open beta",
		owner: "Product: Cloudchamber",
	},
});

// --- Re-export commands from their respective files ---
export {
	containersListCommand,
	containersInfoCommand,
	containersDeleteCommand,
} from "./containers";

export { containersSshCommand } from "./ssh";

export {
	containersRegistriesNamespace,
	containersRegistriesConfigureCommand,
	containersRegistriesListCommand,
	containersRegistriesDeleteCommand,
} from "./registries";

// Build and push commands
export { containersBuildCommand, containersPushCommand } from "./build";

// Images commands
export {
	containersImagesNamespace,
	containersImagesListCommand,
	containersImagesDeleteCommand,
} from "./images";
