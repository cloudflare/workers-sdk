import { rest } from "msw";

export const handlers = [
	rest.post("*/accounts/:accountId/pubsub/namespaces", (_, response, context) =>
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
	rest.get("*/accounts/:accountId/pubsub/namespaces", (_, response, context) =>
		response(
			context.status(200),
			context.json({
				success: true,
				errors: [],
				messages: [],
				result: [
					{ name: "namespace-1", created_on: "01-01-2001" },
					{ name: "namespace-2", created_on: "01-01-2001" },
				],
			})
		)
	),
	rest.post(
		"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers",
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
	rest.patch(
		"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: { url: "https://foo.bar.msw.example.com" },
				})
			)
	),
	rest.get(
		"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: [
						{ name: "broker-1", created_on: "01-01-2001" },
						{ name: "broker-2", created_on: "01-01-2001" },
					],
				})
			)
	),
	rest.get(
		"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: { id: "1234", name: "my-broker" },
				})
			)
	),
	rest.get(
		"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName/credentials",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					//TODO: add credentials mock data
					result: {},
				})
			)
	),
	rest.get(
		"*/accounts/:accountId/pubsub/namespaces/:namespaceName/brokers/:brokerName/publickeys",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					//TODO: add public keys mock data
					result: [],
				})
			)
	),
];
