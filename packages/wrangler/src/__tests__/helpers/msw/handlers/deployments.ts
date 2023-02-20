import { rest } from "msw";
import { createFetchResult } from "../index";

const latestDeployment = {
	id: "Galaxy-Class",
	number: "1701-E",
	annotations: {
		"workers/triggered_by": "rollback",
		"workers/rollback_from": "MOCK-DEPLOYMENT-ID-2222",
	},
	metadata: {
		author_id: "Picard-Gamma-6-0-7-3",
		author_email: "Jean-Luc-Picard@federation.org",
		source: "wrangler",
		created_on: "2021-01-04T00:00:00.000000Z",
		modified_on: "2021-01-04T00:00:00.000000Z",
	},
	resources: {
		script: "MOCK-TAG",
		bindings: [],
	},
};
export const mswSuccessDeployments = [
	rest.get(
		"*/accounts/:accountId/workers/deployments/by-script/:scriptTag",
		(_, response, context) =>
			response.once(
				context.json(
					createFetchResult({
						latest: latestDeployment,
						items: [
							{
								id: "Constitution-Class",
								number: "1701-E",
								annotations: {
									"workers/triggered_by": "upload",
								},
								metadata: {
									author_id: "Picard-Gamma-6-0-7-3",
									author_email: "Jean-Luc-Picard@federation.org",
									source: "wrangler",
									created_on: "2021-01-01T00:00:00.000000Z",
									modified_on: "2021-01-01T00:00:00.000000Z",
								},
							},
							{
								id: "Intrepid-Class",
								number: "NCC-74656",
								annotations: {
									"workers/triggered_by": "rollback",
									"workers/rollback_from": "MOCK-DEPLOYMENT-ID-1111",
								},
								metadata: {
									author_id: "Kathryn-Jane-Gamma-6-0-7-3",
									author_email: "Kathryn-Janeway@federation.org",
									source: "wrangler",
									created_on: "2021-02-02T00:00:00.000000Z",
									modified_on: "2021-02-02T00:00:00.000000Z",
								},
							},
							{
								id: "Intrepid-Class",
								number: "NCC-74656",
								metadata: {
									author_id: "Kathryn-Jane-Gamma-6-0-7-3",
									author_email: "Kathryn-Janeway@federation.org",
									source: "wrangler",
									created_on: "2021-02-03T00:00:00.000000Z",
									modified_on: "2021-02-03T00:00:00.000000Z",
								},
							},
							latestDeployment,
						],
					})
				)
			)
	),
];

export const mswSuccessLastDeployment = [
	rest.get(
		"*/accounts/:accountId/workers/services/:scriptName",
		(_, res, ctx) => {
			return res.once(
				ctx.json(
					createFetchResult({
						default_environment: { script: { last_deployed_from: "wrangler" } },
					})
				)
			);
		}
	),
];
