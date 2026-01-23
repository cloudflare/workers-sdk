import { createNamespace } from "../core/create-command";

// --- Namespace definition ---
export const cloudchamberNamespace = createNamespace({
	metadata: {
		description: "Manage Cloudchamber",
		status: "alpha",
		owner: "Product: Cloudchamber",
		hidden: true,
	},
});

// --- Re-export commands from their respective files ---
export { cloudchamberListCommand } from "./list";
export { cloudchamberCreateCommand } from "./create";
export { cloudchamberDeleteCommand } from "./delete";
export { cloudchamberModifyCommand } from "./modify";
export { cloudchamberApplyCommand } from "./apply";
export { cloudchamberCurlCommand } from "./curl";

// Build and push commands
export { cloudchamberBuildCommand, cloudchamberPushCommand } from "./build";

// SSH subcommands
export {
	cloudchamberSshNamespace,
	cloudchamberSshListCommand,
	cloudchamberSshCreateCommand,
} from "./ssh/ssh";

// Registries subcommands
export {
	cloudchamberRegistriesNamespace,
	cloudchamberRegistriesConfigureCommand,
	cloudchamberRegistriesCredentialsCommand,
	cloudchamberRegistriesRemoveCommand,
	cloudchamberRegistriesListCommand,
} from "./images/registries";

// Images subcommands
export {
	cloudchamberImagesNamespace,
	cloudchamberImagesListCommand,
	cloudchamberImagesDeleteCommand,
} from "./images/images";
