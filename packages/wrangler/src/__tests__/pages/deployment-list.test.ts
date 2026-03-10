import { http, HttpResponse } from "msw";
/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in MSW handlers */
import { afterEach, describe, expect, it } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { endEventLoop } from "../helpers/end-event-loop";
import { mockConsoleMethods } from "../helpers/mock-console";
import { mockAccountId, mockApiToken } from "./../helpers/mock-account-id";
import { msw } from "./../helpers/msw";
import { runInTempDir } from "./../helpers/run-in-tmp";
import { runWrangler } from "./../helpers/run-wrangler";
import type { Deployment } from "./../../pages/types";

describe("pages deployment list", () => {
	runInTempDir();
	mockAccountId();
	mockApiToken();
	const std = mockConsoleMethods();

	afterEach(async () => {
		// Force a tick to ensure that all promises resolve
		await endEventLoop();
		// Reset MSW after tick to ensure that all requests have been handled
		msw.resetHandlers();
		msw.restoreHandlers();
	});

	it("should make request to list deployments", async () => {
		const deployments: Deployment[] = [
			{
				id: "87bbc8fe-16be-45cd-81e0-63d722e82cdf",
				url: "https://87bbc8fe.images.pages.dev",
				environment: "preview",
				created_on: "2021-11-17T14:52:26.133835Z",
				latest_stage: {
					ended_on: "2021-11-17T14:52:26.133835Z",
					status: "success",
				},
				deployment_trigger: {
					metadata: {
						branch: "main",
						commit_hash: "c7649364c4cb32ad4f65b530b9424e8be5bec9d6",
					},
				},
				project_name: "images",
			},
		];

		const requests = mockDeploymentListRequest(deployments);
		await runWrangler("pages deployment list --project-name=images");

		expect(requests.count).toBe(1);
		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			┌─┬─┬─┬─┬─┬─┬─┐
			│ Id │ Environment │ Branch │ Source │ Deployment │ Status │ Build │
			├─┼─┼─┼─┼─┼─┼─┤
			│ 87bbc8fe-16be-45cd-81e0-63d722e82cdf │ Preview │ main │ c764936 │ https://87bbc8fe.images.pages.dev │ [mock-time-ago] │ https://dash.cloudflare.com/some-account-id/pages/view/images/87bbc8fe-16be-45cd-81e0-63d722e82cdf │
			└─┴─┴─┴─┴─┴─┴─┘"
		`);
	});

	it("should make request to list deployments and return result as json", async () => {
		const deployments: Deployment[] = [
			{
				id: "87bbc8fe-16be-45cd-81e0-63d722e82cdf",
				url: "https://87bbc8fe.images.pages.dev",
				environment: "preview",
				created_on: "2021-11-17T14:52:26.133835Z",
				latest_stage: {
					ended_on: "2021-11-17T14:52:26.133835Z",
					status: "success",
				},
				deployment_trigger: {
					metadata: {
						branch: "main",
						commit_hash: "c7649364c4cb32ad4f65b530b9424e8be5bec9d6",
					},
				},
				project_name: "images",
			},
		];

		const requests = mockDeploymentListRequest(deployments);
		await runWrangler("pages deployment list --project-name=images --json");

		expect(requests.count).toBe(1);
		const output = JSON.parse(std.out);

		expect(output[0].Status).toBeTypeOf("string");
		output[0].Status = "SNAPSHOT_VALUE"; // This value would drift from snapshot if not hardcoded as is

		expect(JSON.stringify(output, null, 2)).toMatchInlineSnapshot(`
			"[
			  {
			    "Id": "87bbc8fe-16be-45cd-81e0-63d722e82cdf",
			    "Environment": "Preview",
			    "Branch": "main",
			    "Source": "c764936",
			    "Deployment": "https://87bbc8fe.images.pages.dev",
			    "Status": "SNAPSHOT_VALUE",
			    "Build": "https://dash.cloudflare.com/some-account-id/pages/view/images/87bbc8fe-16be-45cd-81e0-63d722e82cdf"
			  }
			]"
		`);
	});

	it("should pass no environment", async () => {
		const deployments: Deployment[] = [
			{
				id: "87bbc8fe-16be-45cd-81e0-63d722e82cdf",
				url: "https://87bbc8fe.images.pages.dev",
				environment: "preview",
				created_on: "2021-11-17T14:52:26.133835Z",
				latest_stage: {
					ended_on: "2021-11-17T14:52:26.133835Z",
					status: "success",
				},
				deployment_trigger: {
					metadata: {
						branch: "main",
						commit_hash: "c7649364c4cb32ad4f65b530b9424e8be5bec9d6",
					},
				},
				project_name: "images",
			},
		];

		const requests = mockDeploymentListRequest(deployments);
		await runWrangler("pages deployment list --project-name=images");
		expect(requests.count).toBe(1);
		expect(
			requests.queryParams[0].find(([key, _]) => {
				return key === "env";
			})
		).toBeUndefined();
	});

	it("should pass production environment with flag", async () => {
		const deployments: Deployment[] = [
			{
				id: "87bbc8fe-16be-45cd-81e0-63d722e82cdf",
				url: "https://87bbc8fe.images.pages.dev",
				environment: "preview",
				created_on: "2021-11-17T14:52:26.133835Z",
				latest_stage: {
					ended_on: "2021-11-17T14:52:26.133835Z",
					status: "success",
				},
				deployment_trigger: {
					metadata: {
						branch: "main",
						commit_hash: "c7649364c4cb32ad4f65b530b9424e8be5bec9d6",
					},
				},
				project_name: "images",
			},
		];

		const requests = mockDeploymentListRequest(deployments);
		await runWrangler(
			"pages deployment list --project-name=images --environment=production"
		);
		expect(requests.count).toBe(1);
		expect(
			requests.queryParams[0].find(([key, _]) => {
				return key === "env";
			})
		).toStrictEqual(["env", "production"]);
	});

	it("should pass preview environment with flag", async () => {
		const deployments: Deployment[] = [
			{
				id: "87bbc8fe-16be-45cd-81e0-63d722e82cdf",
				url: "https://87bbc8fe.images.pages.dev",
				environment: "preview",
				created_on: "2021-11-17T14:52:26.133835Z",
				latest_stage: {
					ended_on: "2021-11-17T14:52:26.133835Z",
					status: "success",
				},
				deployment_trigger: {
					metadata: {
						branch: "main",
						commit_hash: "c7649364c4cb32ad4f65b530b9424e8be5bec9d6",
					},
				},
				project_name: "images",
			},
		];

		const requests = mockDeploymentListRequest(deployments);
		await runWrangler(
			"pages deployment list --project-name=images --environment=preview"
		);
		expect(requests.count).toBe(1);
		expect(
			requests.queryParams[0].find(([key, _]) => {
				return key === "env";
			})
		).toStrictEqual(["env", "preview"]);
	});
});

/* -------------------------------------------------- */
/*                    Helper Functions                */
/* -------------------------------------------------- */

/**
 * A logger used to check how many times a mock API has been hit.
 * Useful as a helper in our testing to check if wrangler is making
 * the correct API calls without actually sending any web traffic.
 */
type RequestLogger = {
	count: number;
	queryParams: [string, string][][];
};

function mockDeploymentListRequest(deployments: unknown[]): RequestLogger {
	const requests: RequestLogger = { count: 0, queryParams: [] };
	msw.use(
		http.get(
			"*/accounts/:accountId/pages/projects/:project/deployments",
			({ request, params }) => {
				requests.count++;
				const url = new URL(request.url);
				requests.queryParams.push(Array.from(url.searchParams.entries()));
				expect(params.project).toEqual("images");
				expect(params.accountId).toEqual("some-account-id");

				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: deployments,
					},
					{ status: 200 }
				);
			},
			{ once: true }
		)
	);
	return requests;
}
