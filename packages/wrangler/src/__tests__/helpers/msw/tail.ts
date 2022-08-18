import { rest } from "msw";

export const handlers = [
	// Legacy tails endpoint
	rest.post(
		"*/accounts/:accountId/workers/scripts/:scriptName/tails",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						id: "tail-id",
						url: "ws://localhost:1234",
						expires_at: new Date(3005, 1),
					},
				})
			)
	),
	rest.post(
		"*/accounts/:accountId/workers/services/:scriptName/environments/:env/tails",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						id: "tail-id",
						url: "ws://localhost:1234",
						expires_at: new Date(3005, 1),
					},
				})
			)
	),
	// Legacy Endpoint
	rest.delete(
		"*/accounts/:accountId/workers/scripts/:scriptName/tails/:tailId",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({ success: true, errors: [], messages: [] })
			)
	),
	rest.delete(
		"*/accounts/:accountId/workers/services/:scriptName/environments/:envName/tails/:tailId",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({ success: true, errors: [], messages: [] })
			)
	),
];
