import { createNamespace } from "../core/create-command";

export const checkNamespace = createNamespace({
	metadata: {
		description: "☑︎ Run checks on your Worker",
		owner: "Workers: Authoring and Testing",
		status: "alpha",
		hidden: true,
	},
});
