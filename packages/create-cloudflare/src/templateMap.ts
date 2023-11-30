import { runPagesGenerator } from "./pages";
import { runWorkersGenerator } from "./workers";
import type { C3Context } from "types";

type TemplateConfig = {
	label: string;
	handler: (ctx: C3Context) => Promise<void>;
	hidden?: boolean;
};

export const templateMap: Record<string, TemplateConfig> = {
	"hello-world": {
		label: `"Hello World" Worker`,
		handler: runWorkersGenerator,
	},
	webFramework: {
		label: "Website or web app",
		handler: runPagesGenerator,
	},
	common: {
		label: "Example router & proxy Worker",
		handler: runWorkersGenerator,
	},
	scheduled: {
		label: "Scheduled Worker (Cron Trigger)",
		handler: runWorkersGenerator,
	},
	queues: {
		label: "Queue consumer & producer Worker",
		handler: runWorkersGenerator,
	},
	chatgptPlugin: {
		label: `ChatGPT plugin`,
		handler: (ctx) => {
			ctx.args.ts = true;
			return runWorkersGenerator(ctx);
		},
	},
	openapi: {
		label: `OpenAPI 3.1`,
		handler: (ctx) => {
			ctx.args.ts = true;
			return runWorkersGenerator(ctx);
		},
	},
	"pre-existing": {
		label: "Pre-existing Worker (from Dashboard)",
		handler: runWorkersGenerator,
		hidden: true,
	},
};
