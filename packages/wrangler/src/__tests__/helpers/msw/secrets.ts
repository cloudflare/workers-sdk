import { rest } from "msw";

export const handlers = [
	// Legacy Seecret endpoint
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
	// Legacy Seecret endpoint
	rest.get(
		"*/accounts/:accountId/workers/scripts/:scriptName/secrets",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: [
						{
							name: `the-secret-name`,
							type: `secret_text`,
						},
					],
				})
			)
	),
	rest.get(
		"*/accounts/:accountId/workers/services/:scriptName/environments/:env/secrets",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: [
						{
							name: `the-secret-name`,
							type: `secret_text`,
						},
					],
				})
			)
	),
	// Legacy Seecret endpoint
	rest.delete(
		"*/accounts/:accountId/workers/scripts/:scriptName/secrets/:secretKey",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: null,
				})
			)
	),
	rest.delete(
		"*/accounts/:accountId/workers/services/:scriptName/environments/:env/secrets/:secretKey",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: null,
				})
			)
	),
];
