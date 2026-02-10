import { http, HttpResponse } from "msw";
import { expect } from "vitest";
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
	http.get(
		"*/accounts/:accountId/workers/deployments/by-script/:scriptTag",
		({ params }) => {
			const scriptTag = String(params["scriptTag"]);
			return HttpResponse.json(
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
			);
		},
		{ once: true }
	),
];

export const mswSuccessDeploymentScriptMetadata = [
	http.get(
		"*/accounts/:accountId/workers/services/:scriptName",
		({ params }) => {
			const tag = `tag:${params["scriptName"]}`;
			return HttpResponse.json(
				createFetchResult({
					default_environment: {
						script: { last_deployed_from: "wrangler", tag },
					},
				})
			);
		},
		{ once: true }
	),
];

export const mswSuccessDeploymentScriptAPI = [
	http.get(
		"*/accounts/:accountId/workers/services/:scriptName",
		({ params }) => {
			const tag = `tag:${params["scriptName"]}`;
			return HttpResponse.json(
				createFetchResult({
					default_environment: {
						script: { last_deployed_from: "api", tag },
					},
				})
			);
		},
		{ once: true }
	),
];

export const mswSuccessDeploymentDetails = [
	http.get(
		"*/accounts/:accountId/workers/deployments/by-script/:scriptTag/detail/:deploymentId",
		({ request }) => {
			const url = new URL(request.url);
			let bindings: object[] = [];
			if (url.toString().includes("bindings-tag")) {
				bindings = [
					{
						bucket_name: "testr2",
						name: "MY_BUCKET",
						type: "r2_bucket",
					},
				];
			}

			expect(url.toString().includes("1701-E"));
			return HttpResponse.json(
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
			);
		},
		{ once: true }
	),
	// ?deployment=<deploymentid> param used to get deployment <script content> as text
	http.get(
		"*/accounts/:accountId/workers/scripts/:scriptName",
		({ request }) => {
			const url = new URL(request.url);
			let scriptContent = "";
			if (url.searchParams.get("deployment") === "1701-E") {
				scriptContent = `
			export default {
				async fetch(request) {
					return new Response('Hello World from Deployment 1701-E');
				},
			};`;
			} else {
				return HttpResponse.json(null, { status: 400 });
			}
			return HttpResponse.text(scriptContent);
		},
		{ once: true }
	),
];
