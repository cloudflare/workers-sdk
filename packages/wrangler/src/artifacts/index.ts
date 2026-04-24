import { createNamespace } from "../core/create-command";

export const artifactsNamespace = createNamespace({
	metadata: {
		description: "🧱 Manage Artifacts namespaces and repos",
		status: "open beta",
		owner: "Product: Artifacts",
		category: "Storage & databases",
	},
});

export {
	artifactsNamespacesCreateCommand,
	artifactsNamespacesDeleteCommand,
	artifactsNamespacesGetCommand,
	artifactsNamespacesListCommand,
	artifactsNamespacesNamespace,
} from "./namespaces";
export {
	artifactsReposCreateCommand,
	artifactsReposDeleteCommand,
	artifactsReposGetCommand,
	artifactsReposIssueTokenCommand,
	artifactsReposListCommand,
	artifactsReposNamespace,
} from "./repos";
