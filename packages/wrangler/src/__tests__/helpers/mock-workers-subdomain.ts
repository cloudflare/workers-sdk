import { http, HttpResponse } from "msw";
import { createFetchResult, msw } from "./msw";

/** Create a mock handler for the request to get the account's subdomain. */
export function mockSubDomainRequest(
	subdomain = "test-sub-domain",
	registeredWorkersDev = true,
	once = true
) {
	if (registeredWorkersDev) {
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/subdomain",
				() => {
					return HttpResponse.json(createFetchResult({ subdomain }));
				},
				{ once }
			)
		);
	} else {
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/subdomain",
				() => {
					return HttpResponse.json(
						createFetchResult(null, false, [
							{ code: 10007, message: "haven't registered workers.dev" },
						])
					);
				},
				{ once }
			)
		);
	}
}

/** Create a mock handler to fetch the  <script>.<user>.workers.dev subdomain status*/
export function mockGetWorkerSubdomain({
	enabled,
	previews_enabled = false,
	env,
	legacyEnv = false,
	expectedScriptName = "test-name" + (legacyEnv && env ? `-${env}` : ""),
}: {
	enabled: boolean;
	previews_enabled?: boolean;
	env?: string | undefined;
	legacyEnv?: boolean | undefined;
	expectedScriptName?: string | false;
}) {
	const url =
		env && !legacyEnv
			? `*/accounts/:accountId/workers/services/:scriptName/environments/:envName/subdomain`
			: `*/accounts/:accountId/workers/scripts/:scriptName/subdomain`;
	msw.use(
		http.get(
			url,
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				if (expectedScriptName !== false) {
					expect(params.scriptName).toEqual(expectedScriptName);
				}
				if (!legacyEnv) {
					expect(params.envName).toEqual(env);
				}

				return HttpResponse.json(
					createFetchResult({ enabled, previews_enabled })
				);
			},
			{ once: true }
		)
	);
}

/** Create a mock handler to toggle a <script>.<user>.workers.dev subdomain status */
export function mockUpdateWorkerSubdomain({
	enabled,
	previews_enabled = false,
	env,
	legacyEnv = false,
	expectedScriptName = "test-name",
	flakeCount = 0,
}: {
	enabled: boolean;
	previews_enabled?: boolean;
	env?: string | undefined;
	legacyEnv?: boolean | undefined;
	expectedScriptName?: string;
	flakeCount?: number; // The first `flakeCount` requests will fail with a 500 error
}) {
	const url =
		env && !legacyEnv
			? `*/accounts/:accountId/workers/services/:scriptName/environments/:envName/subdomain`
			: `*/accounts/:accountId/workers/scripts/:scriptName/subdomain`;

	const handlers = [
		http.post(
			url,
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(
					legacyEnv && env ? `${expectedScriptName}-${env}` : expectedScriptName
				);
				if (!legacyEnv) {
					expect(params.envName).toEqual(env);
				}
				const body = await request.json();
				expect(body).toEqual({ enabled, previews_enabled });
				return HttpResponse.json(
					createFetchResult({ enabled, previews_enabled })
				);
			},
			{ once: true }
		),
	];
	while (flakeCount > 0) {
		flakeCount--;
		handlers.unshift(
			http.post(
				url,
				() =>
					HttpResponse.json(
						createFetchResult(null, false, [
							{ code: 10013, message: "An unknown error has occurred." },
						]),
						{ status: 500 }
					),
				{ once: true }
			)
		);
	}
	msw.use(...handlers);
}
