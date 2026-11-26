import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { fetch } from "undici";
import { beforeEach, describe, it } from "vitest";
import { startRemoteProxySession } from "../../api";
import { withCfAuth } from "../../user";
import { mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { createFetchResult, msw, mswSuccessUserHandlers } from "../helpers/msw";

mockConsoleMethods();

describe("errors during dev with remote bindings", () => {
	mockApiToken();
	runInTempDir();

	beforeEach(() => {
		msw.use(...mswSuccessUserHandlers);
	});

	it.for([
		{
			caller: "Wrangler",
			inCfAuth: false,
			message:
				'Flagship binding "FLAGS" has no `app_id` and has not been created, but needs to run remotely. Run `wrangler flagship apps create` to create an app.',
		},
		{
			caller: "cf-wrangler",
			inCfAuth: true,
			message:
				'Flagship binding "FLAGS" has no `id` and has not been created, but needs to run remotely. Run `cf flagship apps create` to create an app.',
		},
	])(
		"explains how to create a draft Flagship app for $caller",
		async ({ inCfAuth, message }, { expect }) => {
			const start = () =>
				startRemoteProxySession({
					FLAGS: {
						type: "flagship",
					},
				});

			await expect(
				inCfAuth ? withCfAuth("default", start) : start()
			).rejects.toThrow(message);
		}
	);

	it.for([
		{ caller: "Wrangler", inCfAuth: false, whoami: "wrangler whoami" },
		{ caller: "cf-wrangler", inCfAuth: true, whoami: "cf auth whoami" },
	])(
		"names $caller's commands when the remote session cannot be authenticated",
		async ({ inCfAuth, whoami }, { expect, onTestFinished }) => {
			msw.use(
				http.get(
					"*/accounts/test-account-id/workers/scripts/:scriptName/subdomain/edge-preview",
					() =>
						HttpResponse.json(
							createFetchResult({}, false, [
								{ code: 10000, message: "Authentication error" },
							]),
							{ status: 400 }
						)
				)
			);
			const start = () =>
				startRemoteProxySession(
					{},
					{
						auth: {
							accountId: "test-account-id",
							apiToken: { apiToken: "test-token" },
						},
					}
				);

			const session = await (inCfAuth ? withCfAuth("default", start) : start());
			onTestFinished(() => session.dispose());
			const response = await fetch(session.remoteProxyConnectionString);
			expect(response.status).toBe(503);
			expect(await response.text()).toContain(
				`You can also run \`${whoami}\` to check your current authentication status.`
			);
		}
	);

	it("surfaces account selection errors on the first binding call", async ({
		expect,
		onTestFinished,
	}) => {
		const session = await startRemoteProxySession({
			MY_WORKER: {
				type: "service",
				service: "my-worker",
				remote: true,
			},
		});
		onTestFinished(() => session.dispose());
		const response = await fetch(session.remoteProxyConnectionString, {
			headers: { "MF-Binding": "MY_WORKER" },
		});
		expect(response.status).toBe(503);
		expect(await response.text()).toContain(
			"More than one account available but unable to select one in non-interactive mode."
		);
	});

	it("surfaces remote preview upload errors on the first binding call", async ({
		expect,
		onTestFinished,
	}) => {
		msw.use(
			http.get(
				"*/accounts/test-account-id/workers/scripts/:scriptName/subdomain/edge-preview",
				() =>
					HttpResponse.json(createFetchResult({ token: "test-session-value" }))
			),
			http.get("*/accounts/test-account-id/workers/subdomain", () =>
				HttpResponse.json(createFetchResult({ subdomain: "test" }))
			),
			http.post(
				"*/accounts/test-account-id/workers/scripts/:scriptName/edge-preview",
				() =>
					HttpResponse.json(
						createFetchResult({}, false, [
							{ code: 1000, message: "The remote worker preview failed." },
						]),
						{ status: 400 }
					)
			)
		);

		const session = await startRemoteProxySession(
			{},
			{
				auth: {
					accountId: "test-account-id",
					apiToken: { apiToken: "test-token" },
				},
			}
		);
		onTestFinished(() => session.dispose());
		const response = await fetch(session.remoteProxyConnectionString);
		expect(response.status).toBe(503);
		expect(await response.text()).toMatch(
			/A request to the Cloudflare API .*\/edge-preview\) failed\./
		);
	});
});
