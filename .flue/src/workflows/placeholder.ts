import {
	defineAgent,
	defineWorkflow,
	type WorkflowRouteHandler,
} from "@flue/runtime";
import * as v from "valibot";

export const route: WorkflowRouteHandler = async (_c, next) => next();

export default defineWorkflow({
	agent: defineAgent(() => ({
		model: "cloudflare/@cf/moonshotai/kimi-k2.6",
	})),
	input: v.object({
		message: v.string(),
	}),
	output: v.object({
		message: v.string(),
	}),
	run: ({ input }) => ({
		message: input.message,
	}),
});
