import { processArgument } from "@cloudflare/cli/args";
import type { C3Context } from "types";

const frameworkConfig = [
	{
		label: "Hono",
		value: "hono",
	},
	{
		label: "itty-router",
		value: "itty-router",
	},
];

export default {
	configVersion: 1,
	id: "openapi",
	displayName: "API starter (OpenAPI compliant)",
	platform: "workers",
	copyFiles: {
		async selectVariant(ctx: C3Context) {
			const framework = await processArgument<string>(ctx.args, "framework", {
				type: "select",
				label: "framework",
				question: "Which framework do you want to use?",
				options: frameworkConfig,
				defaultValue: frameworkConfig[0].value,
				validate: (value) => {
					if (
						!frameworkConfig.map((obj) => obj.value).includes(String(value))
					) {
						return `Invalid framework \`${value}\`. Please choose one of the following: ${frameworkConfig.map((obj) => obj.value).join(", ")}.`;
					}
				},
			});

			return framework;
		},
		variants: {
			hono: {
				path: "./hono",
			},
			"itty-router": {
				path: "./itty-router",
			},
		},
	},
};
