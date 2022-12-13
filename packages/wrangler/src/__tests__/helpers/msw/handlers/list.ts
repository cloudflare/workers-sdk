import { rest } from "msw";

export const mswSuccessServices = [
	rest.get(
		"*/accounts/:accountId/workers/services",
		(request, response, context) => {
			let result;
			const services = [
				{
					id: "worker-one",
					created_on: "2021-02-02T00:00:00.000000Z",
					default_environment: {
						script: {
							last_deployed_from: "wrangler",
						},
					},
				},
				{
					id: "other-worker",
					created_on: "2021-02-02T00:00:00.000000Z",
					default_environment: {
						script: {
							last_deployed_from: "wrangler",
						},
					},
				},
			];

			const params = request.url.searchParams;
			const name = params.get("name");
			if (name) {
				result = services.filter((service) => service["id"].startsWith(name));
			} else {
				result = services;
			}

			return response.once(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: result,
				})
			);
		}
	),
];
