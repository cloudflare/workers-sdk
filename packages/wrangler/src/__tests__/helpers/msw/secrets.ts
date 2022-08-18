import { rest } from "msw";

export const handlers = [
	// Legacy tails endpoint
	rest.put(
		"*/accounts/:accountId/workers/scripts/:scriptName/secrets",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						name: `secret-name`,
						type: `secret_text`,
					},
				})
			)
	),
	rest.put(
		"*/accounts/:accountId/workers/services/:scriptName/environments/:env/secrets",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						name: `secret-name`,
						type: `secret_text`,
					},
				})
			)
	),
];
