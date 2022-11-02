import { rest } from "msw";

export type DeploymentListRes = {
	deployments: {
		version_id: string;
		version_number: string;
		metadata: {
			author_id: string;
			author_email: string;
			source: "api" | "dash" | "wrangler" | "terraform" | "other";
			created_on: string;
			modified_on: string;
		};
		preview: {
			active: boolean;
			url: string;
		};
		resources: {
			script: string;
			bindings: unknown[];
		};
	}[];
};

export const mswSuccessDeployments = [
	rest.get(
		"*/accounts/:accountId/workers/deployments/by-script/:scriptTag",
		(_, response, context) =>
			response.once(
				context.status(200),
				context.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						deployments: [
							{
								version_id: "Galaxy-Class",
								version_number: "1701-E",
								metadata: {
									author_id: "Picard-Gamma-6-0-7-3",
									author_email: "Jean-Luc-Picard@federation.org",
									source: "wrangler",
									created_on: "2021-01-01T00:00:00.000000Z",
									modified_on: "2021-01-01T00:00:00.000000Z",
								},
								preview: {
									active: true,
									url: "https://example.com",
								},
								resources: {
									script: "script.js",
									bindings: [],
								},
							},
							{
								version_id: "Intrepid-Class",
								version_number: "NCC-74656",
								metadata: {
									author_id: "Kathryn-Jane-Gamma-6-0-7-3",
									author_email: "Kathryn-Janeway@federation.org",
									source: "wrangler",
									created_on: "2021-02-02T00:00:00.000000Z",
									modified_on: "2021-02-02T00:00:00.000000Z",
								},
								preview: {
									active: true,
									url: "https://example.com",
								},
								resources: {
									script: "script.js",
									bindings: [],
								},
							},
						],
					},
				})
			)
	),
];
