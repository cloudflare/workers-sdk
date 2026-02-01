import { http, HttpResponse } from "msw";
import { createFetchResult } from "../index";
import type {
	ApiDeployment,
	ApiVersion,
} from "../../../../commands/versions/types";

export const mswListNewDeploymentsLatestFull = [
	http.get(
		"*/accounts/:accountId/workers/scripts/:scriptName/deployments",
		({ params }) => {
			return HttpResponse.json(
				createFetchResult({
					deployments: [
						{
							id: `deployment:${params["scriptName"]}`,
							source: "api",
							strategy: "percentage",
							author_email: "author@example.com",
							created_on: "2021-01-01T00:00:00.000000Z",
							versions: [
								{
									version_id: `${params["scriptName"]}:version:0`,
									percentage: 100.0,
								},
							],
						},
					] as Array<ApiDeployment>,
				})
			);
		},
		{ once: true }
	),
	http.get(
		"*/accounts/:accountId/workers/scripts/:scriptName/versions/:version",
		({ params }) => {
			return HttpResponse.json(
				createFetchResult({
					id: params["version"],
					number: 1,
					metadata: {
						created_on: "2021-01-01T00:00:00.000000Z",
						modified_on: "2021-01-01T00:00:00.000000Z",
						source: "api",
						author_email: "author@example.com",
					},
				} as ApiVersion)
			);
		},
		{ once: false }
	),
];

export const mswListNewDeploymentsLatestFiftyFifty = [
	http.get(
		"*/accounts/:accountId/workers/scripts/:scriptName/deployments",
		({ params }) => {
			return HttpResponse.json(
				createFetchResult({
					deployments: [
						{
							id: `deployment:${params["scriptName"]}`,
							source: "api",
							strategy: "percentage",
							author_email: "author@example.com",
							created_on: "2021-01-01T00:00:00.000000Z",
							versions: [
								{
									version_id: `${params["scriptName"]}:version:0`,
									percentage: 50.0,
								},
								{
									version_id: `${params["scriptName"]}:version:1`,
									percentage: 50.0,
								},
							],
						},
					] as Array<ApiDeployment>,
				})
			);
		},
		{ once: true }
	),
	http.get(
		"*/accounts/:accountId/workers/scripts/:scriptName/versions/:version",
		({ params }) => {
			return HttpResponse.json(
				createFetchResult({
					id: params["version"],
					number: 1,
					metadata: {
						created_on: "2021-01-01T00:00:00.000000Z",
						modified_on: "2021-01-01T00:00:00.000000Z",
						source: "api",
						author_email: "author@example.com",
					},
				} as ApiVersion)
			);
		},
		{ once: false }
	),
];

export const mswListNewDeployments = http.get(
	"*/accounts/:accountId/workers/scripts/:workerName/deployments",
	({ params }) => {
		const workerName = String(params["workerName"]);
		return HttpResponse.json(
			createFetchResult({
				deployments: [
					{
						id: `Galaxy-Class-${workerName}`,
						source: "api",
						strategy: "percentage",
						author_email: "Jean-Luc-Picard@federation.org",
						created_on: "2021-01-04T00:00:00.000000Z",
						annotations: {
							"workers/triggered_by": "rollback",
							"workers/rollback_from": "MOCK-DEPLOYMENT-ID-2222",
						},
						versions: [
							{
								version_id: "10000000-0000-0000-0000-000000000000",
								percentage: 10,
							},
							{
								version_id: "20000000-0000-0000-0000-000000000000",
								percentage: 90,
							},
						],
					},
					{
						id: `Galaxy-Class-${workerName}`,
						source: "wrangler",
						strategy: "percentage",
						author_email: "Jean-Luc-Picard@federation.org",
						created_on: "2021-01-01T00:00:00.000000Z",
						annotations: {
							"workers/triggered_by": "upload",
						},
						versions: [
							{
								version_id: "10000000-0000-0000-0000-000000000000",
								percentage: 20,
							},
							{
								version_id: "20000000-0000-0000-0000-000000000000",
								percentage: 80,
							},
						],
					},
					{
						id: `Intrepid-Class-${workerName}`,
						source: "wrangler",
						strategy: "percentage",
						author_email: "Kathryn-Janeway@federation.org",
						created_on: "2021-02-02T00:00:00.000000Z",
						annotations: {
							"workers/triggered_by": "rollback",
							"workers/rollback_from": "MOCK-DEPLOYMENT-ID-1111",
							"workers/message": "Rolled back for this version",
						},
						versions: [
							{
								version_id: "10000000-0000-0000-0000-000000000000",
								percentage: 30,
							},
							{
								version_id: "20000000-0000-0000-0000-000000000000",
								percentage: 70,
							},
						],
					},
					{
						id: `3mEgaU1T-Intrepid-someThing-${workerName}`,
						source: "wrangler",
						strategy: "percentage",
						author_email: "Kathryn-Janeway@federation.org",
						created_on: "2021-02-03T00:00:00.000000Z",
						versions: [
							{
								version_id: "10000000-0000-0000-0000-000000000000",
								percentage: 40,
							},
							{
								version_id: "20000000-0000-0000-0000-000000000000",
								percentage: 60,
							},
						],
					},
				],
			})
		);
	}
);

const latestVersion = (workerName: string) => ({
	id: `20000000-0000-0000-0000-000000000000`,
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
		script: workerName,
		bindings: [],
	},
});
export const mswListVersions = http.get(
	"*/accounts/:accountId/workers/scripts/:workerName/versions",
	({ params }) => {
		const workerName = String(params["workerName"]);
		return HttpResponse.json(
			createFetchResult({
				latest: latestVersion(workerName),
				items: [
					{
						id: `10000000-0000-0000-0000-000000000000`,
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
					// Latest version deployed at 01-04 takes 2xxxxxx
					{
						id: `30000000-0000-0000-0000-000000000000`,
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
						id: `40000000-0000-0000-0000-000000000000`,
						number: "NCC-74656",
						metadata: {
							author_id: "Kathryn-Jane-Gamma-6-0-7-3",
							author_email: "Kathryn-Janeway@federation.org",
							source: "wrangler",
							created_on: "2021-02-03T00:00:00.000000Z",
							modified_on: "2021-02-03T00:00:00.000000Z",
						},
					},
					latestVersion(workerName),
				],
			})
		);
	}
);

export const mswGetVersion = (version?: ApiVersion) =>
	http.get(
		"*/accounts/:accountId/workers/scripts/:workerName/versions/:versionId",
		({ params }) => {
			const versionId = String(params["versionId"]);

			if (versionId === "ffffffff-ffff-ffff-ffff-ffffffffffff") {
				return HttpResponse.json(createFetchResult({}, false));
			}

			return HttpResponse.json(
				createFetchResult(
					version ??
						({
							id: versionId,
							number: 1,
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
							resources: {
								bindings: [
									{
										type: "analytics_engine",
										name: "ANALYTICS",
										dataset: "analytics_dataset",
									},
									{
										type: "kv_namespace",
										name: "KV",
										namespace_id: "kv-namespace-id",
									},
								],
								script: {
									etag: "aaabbbccc",
									handlers: ["fetch", "scheduled"],
									last_deployed_from: "api",
								},
								script_runtime: {
									compatibility_date: "2020-01-01",
									compatibility_flags: ["test", "flag"],
									usage_model: "standard",
									limits: { cpu_ms: 50 },
								},
							},
						} as ApiVersion)
				)
			);
		}
	);

export const mswPostNewDeployment = http.post(
	"*/accounts/:accountId/workers/scripts/:workerName/deployments",
	() => {
		return HttpResponse.json(
			createFetchResult({ id: "mock-new-deployment-id" })
		);
	}
);

export const mswPatchNonVersionedScriptSettings = http.patch(
	"*/accounts/:accountId/workers/scripts/:workerName/script-settings",
	async ({ request }) => {
		return HttpResponse.json(createFetchResult(await request.json()));
	}
);
