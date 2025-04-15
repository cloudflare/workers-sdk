/* eslint-disable no-shadow */

import { createNamespace } from "../core/create-command";
import { CLEANUP } from "./utils";

// Create the main pages namespace
export const pagesNamespace = createNamespace({
	metadata: {
		description: "⚡️ Configure Cloudflare Pages",
		status: "stable",
		owner: "Workers: Authoring and Testing",
	},
});

// Create subcommand namespaces
export const pagesFunctionsNamespace = createNamespace({
	metadata: {
		description: "Helpers related to Pages Functions",
		status: "stable",
		owner: "Workers: Authoring and Testing",
	},
});

export const pagesProjectNamespace = createNamespace({
	metadata: {
		description: "Interact with your Pages projects",
		status: "stable",
		owner: "Workers: Authoring and Testing",
	},
});

export const pagesDeploymentNamespace = createNamespace({
	metadata: {
		description: "Interact with the deployments of a project",
		status: "stable",
		owner: "Workers: Authoring and Testing",
	},
});

export const pagesDownloadNamespace = createNamespace({
	metadata: {
		description: "Download settings from your project",
		status: "stable",
		owner: "Workers: Authoring and Testing",
	},
});

process.on("SIGINT", () => {
	CLEANUP();
	process.exit();
});
process.on("SIGTERM", () => {
	CLEANUP();
	process.exit();
});

export { pagesDevCommand } from "./dev";
export { pagesFunctionsBuildCommand } from "./build";
export { pagesFunctionsBuildEnvCommand } from "./build-env";
export { pagesFunctionsOptimizeRoutesCommand } from "./functions";
export {
	pagesProjectListCommand,
	pagesProjectCreateCommand,
	pagesProjectDeleteCommand,
} from "./projects";
export { pagesProjectUploadCommand } from "./upload";
export { pagesProjectValidateCommand } from "./validate";
export { pagesDeploymentListCommand } from "./deployments";
export { pagesDeploymentTailCommand } from "./deployment-tails";
export { pagesDeploymentCreateCommand, pagesDeployCommand } from "./deploy";
export { pagesDownloadConfigCommand } from "./download-config";
export {
	pagesSecretNamespace,
	pagesSecretPutCommand,
	pagesSecretBulkCommand,
	pagesSecretDeleteCommand,
	pagesSecretListCommand,
} from "./secret";
