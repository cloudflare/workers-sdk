import { createNamespace } from "../core/create-command";
import { CLEANUP } from "./utils";

export const pagesNamespace = createNamespace({
	metadata: {
		description: "⚡️ Configure Cloudflare Pages",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
		category: "Compute & AI",
	},
});

export const pagesFunctionsNamespace = createNamespace({
	metadata: {
		description: "Helpers related to Pages Functions",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
});

export const pagesProjectNamespace = createNamespace({
	metadata: {
		description: "Interact with your Pages projects",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
});

export const pagesDeploymentNamespace = createNamespace({
	metadata: {
		description: "Interact with the deployments of a project",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
});

export const pagesDownloadNamespace = createNamespace({
	metadata: {
		description: "Download settings from your project",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
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
