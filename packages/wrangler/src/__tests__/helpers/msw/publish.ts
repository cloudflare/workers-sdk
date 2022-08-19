import { rest } from "msw";

export const handlers = [
	rest.put(
		"*/accounts/:accountId/workers/services/:scriptName/environments/:envName",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						available_on_subdomain: true,
						id: "abc12345",
						etag: "etag98765",
						pipeline_hash: "hash9999",
					},
				})
			)
	),
	rest.put(
		"*/accounts/:accountId/workers/scripts/:scriptName",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						available_on_subdomain: true,
						id: "abc12345",
						etag: "etag98765",
						pipeline_hash: "hash9999",
					},
				})
			)
	),
	rest.post(
		"*/accounts/:accountId/workers/services/:scriptName/environments/:envName/domains/changeset",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						id: "abc12345",
						etag: "etag98765",
						pipeline_hash: "hash9999",
					},
				})
			)
	),
	rest.post(
		"*/accounts/:accountId/workers/scripts/:scriptName/domains/changeset",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						id: "abc12345",
						etag: "etag98765",
						pipeline_hash: "hash9999",
					},
				})
			)
	),
	rest.get("*/accounts/:accountId/workers/subdomain", (_, response, context) =>
		response(
			context.status(200),
			context.json({
				success: true,
				errors: [],
				messages: [],
				result: {
					subdomain: "test-sub-domain",
				},
			})
		)
	),
	rest.post(
		"*/accounts/:accountId/workers/services/:scriptName/environments/:envName/subdomain",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({ success: true, errors: [], messages: [], result: {} })
			)
	),
	rest.post(
		"*/accounts/:accountId/workers/scripts/:scriptName/subdomain",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({ success: true, errors: [], messages: [], result: {} })
			)
	),
	rest.post(
		"*/accounts/:accountId/workers/services/:scriptName/environments/:envName/routes",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({ success: true, errors: [], messages: [], result: {} })
			)
	),
	rest.post(
		"*/accounts/:accountId/workers/scripts/:scriptName/routes",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({ success: true, errors: [], messages: [], result: {} })
			)
	),
	rest.put(
		"*/accounts/:accountId/workers/services/:scriptName/environments/:envName/routes",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: [
						"some-example.com/some-route/*",
						{ pattern: "*a-boring-website.com", zone_id: "54sdf7fsda" },
						{
							pattern: "*another-boring-website.com",
							zone_name: "some-zone.com",
						},
						{ pattern: "example.com/some-route/*", zone_id: "JGHFHG654gjcj" },
						"more-examples.com/*",
					],
				})
			)
	),
	rest.put(
		"*/accounts/:accountId/workers/scripts/:scriptName/routes",
		(_, response, context) =>
			response(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: [
						"some-example.com/some-route/*",
						{ pattern: "*a-boring-website.com", zone_id: "54sdf7fsda" },
						{
							pattern: "*another-boring-website.com",
							zone_name: "some-zone.com",
						},
						{ pattern: "example.com/some-route/*", zone_id: "JGHFHG654gjcj" },
						"more-examples.com/*",
					],
				})
			)
	),
	rest.post("*/zones/:zoneId/workers/routes", (_, response, context) =>
		response.once(
			context.status(200),
			context.json({
				success: true,
				errors: [],
				messages: [],
				result: [
					{
						pattern: "foo.example.com/other-route",
						script: "test-name",
					},
				],
			})
		)
	),
	rest.get("*/zones", (_, response, context) =>
		response(
			context.status(200),
			context.json({
				success: true,
				errors: [],
				messages: [],
				result: [
					{
						id: "some-zone-id",
					},
				],
			})
		)
	),
	rest.get("*/zones/:zoneId/workers/routes", (_, response, context) =>
		response(
			context.status(200),
			context.json({
				success: true,
				errors: [],
				messages: [],
				result: [
					{
						pattern: "foo.example.com/other-route",
						script: "test-name",
					},
				],
			})
		)
	),
];
