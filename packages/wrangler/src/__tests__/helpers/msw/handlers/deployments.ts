import { rest } from "msw";
import { createFetchResult } from "../index";

const latestDeployment = (scriptTag: string) => ({
	id: `Galaxy-Class-${scriptTag}`,
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
		script: scriptTag,
		bindings: [],
	},
});
export const mswSuccessDeployments = [
	rest.get(
		"*/accounts/:accountId/workers/deployments/by-script/:scriptTag",
		(request, response, context) => {
			const scriptTag = String(request.params["scriptTag"]);
			return response.once(
				context.json(
					createFetchResult({
						latest: latestDeployment(scriptTag),
						items: [
							{
								id: `Constitution-Class-${scriptTag}`,
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
								id: `Intrepid-Class-${scriptTag}`,
								number: "NCC-74656",
								annotations: {
									"workers/triggered_by": "rollback",
									"workers/rollback_from": "MOCK-DEPLOYMENT-ID-1111",
									"workers/message": "Rolled back for this version",
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
								id: `3mEgaU1T-Intrepid-someThing-${scriptTag}`,
								number: "NCC-74656",
								metadata: {
									author_id: "Kathryn-Jane-Gamma-6-0-7-3",
									author_email: "Kathryn-Janeway@federation.org",
									source: "wrangler",
									created_on: "2021-02-03T00:00:00.000000Z",
									modified_on: "2021-02-03T00:00:00.000000Z",
								},
							},
							latestDeployment(scriptTag),
						],
					})
				)
			);
		}
	),
];

export const mswSuccessDeploymentScriptMetadata = [
	rest.get(
		"*/accounts/:accountId/workers/services/:scriptName",
		(req, res, ctx) => {
			const tag = `tag:${req.params["scriptName"]}`;
			return res.once(
				ctx.json(
					createFetchResult({
						default_environment: {
							script: { last_deployed_from: "wrangler", tag },
						},
					})
				)
			);
		}
	),
];

export const mswSuccessDeploymentScriptAPI = [
	rest.get(
		"*/accounts/:accountId/workers/services/:scriptName",
		(req, res, ctx) => {
			const tag = `tag:${req.params["scriptName"]}`;
			return res.once(
				ctx.json(
					createFetchResult({
						default_environment: {
							script: { last_deployed_from: "api", tag },
						},
					})
				)
			);
		}
	),
];

export const mswSuccessDeploymentDetails = [
	rest.get(
		"*/accounts/:accountId/workers/deployments/by-script/:scriptTag/detail/:deploymentId",
		(req, res, ctx) => {
			let bindings: object[] = [];
			if (req.url.toString().includes("bindings-tag")) {
				bindings = [
					{
						bucket_name: "testr2",
						name: "MY_BUCKET",
						type: "r2_bucket",
					},
				];
			}

			expect(req.url.toString().includes("1701-E"));
			return res.once(
				ctx.json(
					createFetchResult({
						id: "1701-E",
						Number: 0,
						metadata: {
							author_id: "Picard-Gamma-6-0-7-3",
							author_email: "Jean-Luc-Picard@federation.org",
							source: "wrangler",
							created_on: "2021-01-01T00:00:00.000000Z",
							modified_on: "2021-01-01T00:00:00.000000Z",
						},
						resources: {
							script: {
								etag: "mock-e-tag",
								handlers: ["fetch"],
								last_deployed_from: "wrangler",
							},
							script_runtime: {
								usage_model: "bundled",
							},
							bindings: bindings,
						},
					})
				)
			);
		}
	),
	// ?deployment=<deploymentid> param used to get deployment <script content> as text
	rest.get(
		"*/accounts/:accountId/workers/scripts/:scriptName",
		(req, res, ctx) => {
			let scriptContent = "";
			if (req.url.searchParams.get("deployment") === "1701-E") {
				scriptContent = `
			export default {
				async fetch(request) {
					return new Response('Hello World from Deployment 1701-E');
				},
			};`;
			} else {
				return res(ctx.status(400));
			}
			return res.once(ctx.text(scriptContent));
		}
	),
];
