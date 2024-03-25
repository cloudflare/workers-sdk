import { rest } from "msw";
import { createFetchResult } from "../index";

export const mswListNewDeployments = rest.get(
	"*/accounts/:accountId/workers/scripts/:workerName/deployments",
	(request, response, context) => {
		const workerName = String(request.params["workerName"]);
		return response(
			context.json(
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
			)
		);
	}
);

const latestVersion = (workerName: string) => ({
	id: `10000000-0000-0000-0000-000000000000`,
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
export const mswListVersions = rest.get(
	"*/accounts/:accountId/workers/scripts/:workerName/versions",
	(request, response, context) => {
		const workerName = String(request.params["workerName"]);
		return response(
			context.json(
				createFetchResult({
					latest: latestVersion(workerName),
					items: [
						{
							id: `40000000-0000-0000-0000-000000000000`,
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
							id: `20000000-0000-0000-0000-000000000000`,
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
			)
		);
	}
);

export const mswGetVersion = rest.get(
	"*/accounts/:accountId/workers/scripts/:workerName/versions/:versionId",
	(request, response, context) => {
		const versionId = String(request.params["versionId"]);

		if (versionId === "ffffffff-ffff-ffff-ffff-ffffffffffff") {
			return response(context.json(createFetchResult({}, false)));
		}

		return response(
			context.json(
				createFetchResult({
					id: versionId,
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
				})
			)
		);
	}
);

export const mswPostNewDeployment = rest.post(
	"*/accounts/:accountId/workers/scripts/:workerName/deployments",
	(request, response, context) => {
		return response(
			context.json(createFetchResult({ id: "mock-new-deployment-id" }))
		);
	}
);

export const mswPatchNonVersionedScriptSettings = rest.patch(
	"*/accounts/:accountId/workers/scripts/:workerName/script-settings",
	(request, response, context) => {
		return response(context.json(createFetchResult(request.json())));
	}
);
export const mswGetNonVersionedScriptSettings = rest.patch(
	"*/accounts/:accountId/workers/scripts/:workerName/script-settings",
	(request, response, context) => {
		return response(
			context.json(
				createFetchResult({
					logpush: false,
					tail_consumers: [],
				})
			)
		);
	}
);
