/* eslint-disable @typescript-eslint/no-empty-object-type */
import { Buffer } from "node:buffer";
import * as fs from "node:fs";
import * as path from "node:path";
import { http, HttpResponse } from "msw";
import { expect } from "vitest";
import { captureRequestsFrom } from "../helpers/capture-requests-from";
import {
	createFetchResult,
	msw,
	mswSuccessDeployments,
	mswSuccessDeploymentScriptMetadata,
} from "../helpers/msw";
import type { AssetManifest } from "../../assets";
import type { CustomDomain, CustomDomainChangeset } from "../../deploy/deploy";
import type { PostTypedConsumerBody, QueueResponse } from "../../queues/client";
import type {
	Config,
	ServiceMetadataRes,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";
import type { FormData } from "undici";

/** Write mock assets to the file system so they can be uploaded. */
export function writeAssets(
	assets: { filePath: string; content: string }[],
	destination = "assets"
) {
	for (const asset of assets) {
		const filePathDestination = path.join(destination, asset.filePath);
		fs.mkdirSync(path.dirname(filePathDestination), {
			recursive: true,
		});
		fs.writeFileSync(filePathDestination, asset.content);
	}
}
export function mockDeploymentsListRequest() {
	msw.use(...mswSuccessDeployments);
}

export function mockLastDeploymentRequest() {
	msw.use(...mswSuccessDeploymentScriptMetadata);
}

export function mockPublishSchedulesRequest({
	crons = [],
	env = undefined,
	useServiceEnvironments = true,
}: {
	crons: Config["triggers"]["crons"];
	env?: string | undefined;
	useServiceEnvironments?: boolean | undefined;
}) {
	const servicesOrScripts =
		env && useServiceEnvironments ? "services" : "scripts";
	const environment =
		env && useServiceEnvironments ? "/environments/:envName" : "";

	msw.use(
		http.put(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/schedules`,
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(
					!useServiceEnvironments && env ? `test-name-${env}` : "test-name"
				);
				if (useServiceEnvironments) {
					expect(params.envName).toEqual(env);
				}
				const body = (await request.json()) as [{ cron: string }];
				expect(body).toEqual(crons.map((cron) => ({ cron })));
				return HttpResponse.json(createFetchResult(null));
			},
			{ once: true }
		)
	);
}

export function mockPublishRoutesRequest({
	routes = [],
	env = undefined,
	useServiceEnvironments = true,
}: {
	routes: Config["routes"];
	env?: string | undefined;
	useServiceEnvironments?: boolean | undefined;
}) {
	const servicesOrScripts =
		env && useServiceEnvironments ? "services" : "scripts";
	const environment =
		env && useServiceEnvironments ? "/environments/:envName" : "";

	msw.use(
		http.put(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/routes`,
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(
					!useServiceEnvironments && env ? `test-name-${env}` : "test-name"
				);
				if (useServiceEnvironments) {
					expect(params.envName).toEqual(env);
				}
				const body = await request.json();
				expect(body).toEqual(
					routes.map((route) =>
						typeof route !== "object" ? { pattern: route } : route
					)
				);
				return HttpResponse.json(createFetchResult(null));
			},
			{ once: true }
		)
	);
}

export function mockUnauthorizedPublishRoutesRequest({
	env = undefined,
	useServiceEnvironments = true,
}: {
	env?: string | undefined;
	useServiceEnvironments?: boolean | undefined;
} = {}) {
	const servicesOrScripts =
		env && useServiceEnvironments ? "services" : "scripts";
	const environment =
		env && useServiceEnvironments ? "/environments/:envName" : "";

	msw.use(
		http.put(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/routes`,
			() => {
				return HttpResponse.json(
					createFetchResult(null, false, [
						{ message: "Authentication error", code: 10000 },
					])
				);
			},
			{ once: true }
		)
	);
}

export function mockPublishRoutesFallbackRequest(route: {
	pattern: string;
	script: string;
}) {
	msw.use(
		http.post(
			`*/zones/:zoneId/workers/routes`,
			async ({ request }) => {
				const body = await request.json();
				expect(body).toEqual(route);
				return HttpResponse.json(createFetchResult(route.pattern));
			},
			{ once: true }
		)
	);
}

export function mockCustomDomainLookup(origin: CustomDomain) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/domains/records/:domainTag`,

			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.domainTag).toEqual(origin.id);

				return HttpResponse.json(createFetchResult(origin));
			},
			{ once: true }
		)
	);
}

export function mockCustomDomainsChangesetRequest({
	originConflicts = [],
	dnsRecordConflicts = [],
	env = undefined,
	useServiceEnvironments = true,
}: {
	originConflicts?: Array<CustomDomain>;
	dnsRecordConflicts?: Array<CustomDomain>;
	env?: string | undefined;
	useServiceEnvironments?: boolean | undefined;
}) {
	const servicesOrScripts =
		env && useServiceEnvironments ? "services" : "scripts";
	const environment =
		env && useServiceEnvironments ? "/environments/:envName" : "";
	msw.use(
		http.post<{ accountId: string; scriptName: string; envName: string }>(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/domains/changeset`,
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(
					!useServiceEnvironments && env ? `test-name-${env}` : "test-name"
				);
				if (useServiceEnvironments) {
					expect(params.envName).toEqual(env);
				}

				const domains = (await request.json()) as Array<
					{ hostname: string } & ({ zone_id?: string } | { zone_name?: string })
				>;

				const changeset: CustomDomainChangeset = {
					added: domains.map((domain) => {
						return {
							...domain,
							id: "",
							service: params.scriptName,
							environment: params.envName,
							zone_name: "",
							zone_id: "",
						};
					}),
					removed: [],
					updated:
						originConflicts?.map((domain) => {
							return {
								...domain,
								modified: true,
							};
						}) ?? [],
					conflicting: dnsRecordConflicts,
				};

				return HttpResponse.json(createFetchResult(changeset));
			},
			{ once: true }
		)
	);
}

export function mockPublishCustomDomainsRequest({
	publishFlags,
	domains = [],
	env = undefined,
	useServiceEnvironments = true,
}: {
	publishFlags: {
		override_scope: boolean;
		override_existing_origin: boolean;
		override_existing_dns_record: boolean;
	};
	domains: Array<
		{ hostname: string } & ({ zone_id?: string } | { zone_name?: string })
	>;
	env?: string | undefined;
	useServiceEnvironments?: boolean | undefined;
}) {
	const servicesOrScripts =
		env && useServiceEnvironments ? "services" : "scripts";
	const environment =
		env && useServiceEnvironments ? "/environments/:envName" : "";

	msw.use(
		http.put(
			`*/accounts/:accountId/workers/${servicesOrScripts}/:scriptName${environment}/domains/records`,
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.scriptName).toEqual(
					!useServiceEnvironments && env ? `test-name-${env}` : "test-name"
				);
				if (useServiceEnvironments) {
					expect(params.envName).toEqual(env);
				}
				const body = await request.json();
				expect(body).toEqual({
					...publishFlags,
					origins: domains,
				});

				return HttpResponse.json(createFetchResult(null));
			},
			{ once: true }
		)
	);
}

export interface ExpectedAsset {
	filePath: string;
	content: string;
	expiration?: number;
	expiration_ttl?: number;
}
export interface StaticAssetUpload {
	key: string;
	base64: boolean;
	value: string;
	expiration: number | undefined;
	expiration_ttl: number | undefined;
}

/** Create a mock handler for the request that tries to do a bulk upload of assets to a KV namespace. */
//TODO: This is getting called multiple times in the test, we need to check if that is happening in Production --Jacob 2021-03-02
export function mockUploadAssetsToKVRequest(
	expectedNamespaceId: string,
	assets?: ExpectedAsset[]
) {
	const requests: {
		uploads: StaticAssetUpload[];
	}[] = [];
	msw.use(
		http.put(
			"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk",
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.namespaceId).toEqual(expectedNamespaceId);
				const uploads = (await request.json()) as StaticAssetUpload[];
				if (assets) {
					expect(assets.length).toEqual(uploads.length);
					for (let i = 0; i < uploads.length; i++) {
						checkAssetUpload(assets[i], uploads[i]);
					}
				}

				requests.push({ uploads });
				return HttpResponse.json(createFetchResult([]));
			}
		)
	);
	return requests;
}

export function checkAssetUpload(
	asset: ExpectedAsset,
	upload: StaticAssetUpload
) {
	// The asset key consists of: `<basename>.<hash>.<extension>`
	const keyMatcher = new RegExp(
		"^" +
			asset.filePath.replace(/(\.[^.]+)$/, ".[a-z0-9]+$1").replace(/\./g, "\\.")
	);
	expect(upload.key).toMatch(keyMatcher);
	// The asset value is base64 encoded.
	expect(upload.base64).toBe(true);
	expect(Buffer.from(upload.value, "base64").toString()).toEqual(asset.content);
	expect(upload.expiration).toEqual(asset.expiration);
	expect(upload.expiration_ttl).toEqual(asset.expiration_ttl);
}

/** Create a mock handler for thr request that does a bulk delete of unused assets */
export function mockDeleteUnusedAssetsRequest(
	expectedNamespaceId: string,
	assets: string[]
) {
	msw.use(
		http.delete(
			"*/accounts/:accountId/storage/kv/namespaces/:namespaceId/bulk",
			async ({ request, params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.namespaceId).toEqual(expectedNamespaceId);
				const deletes = await request.json();
				expect(assets).toEqual(deletes);
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: null,
				});
			},
			{ once: true }
		)
	);
}

export type DurableScriptInfo = {
	id: string;
	migration_tag?: string;
	tag?: string;
	tags?: string[] | null;
};

export function mockServiceScriptData(options: {
	script?: DurableScriptInfo;
	scriptName?: string;
	env?: string;
	dispatchNamespace?: string;
}) {
	const { script } = options;
	if (options.dispatchNamespace) {
		if (!script) {
			msw.use(
				http.get(
					"*/accounts/:accountId/workers/dispatch/namespaces/:dispatchNamespace/scripts/:scriptName",
					() => {
						return HttpResponse.json({
							success: false,
							errors: [
								{
									code: 10092,
									message: "workers.api.error.environment_not_found",
								},
							],
							messages: [],
							result: null,
						});
					},
					{ once: true }
				)
			);
			return;
		}
		msw.use(
			http.get(
				"*/accounts/:accountId/workers/dispatch/namespaces/:dispatchNamespace/scripts/:scriptName",
				({ params }) => {
					expect(params.accountId).toEqual("some-account-id");
					expect(params.scriptName).toEqual(options.scriptName || "test-name");
					expect(params.dispatchNamespace).toEqual(options.dispatchNamespace);
					return HttpResponse.json({
						success: true,
						errors: [],
						messages: [],
						result: { script },
					});
				},
				{ once: true }
			)
		);
	} else {
		if (options.env) {
			if (!script) {
				msw.use(
					http.get(
						"*/accounts/:accountId/workers/services/:scriptName/environments/:envName",
						() => {
							return HttpResponse.json({
								success: false,
								errors: [
									{
										code: 10092,
										message: "workers.api.error.environment_not_found",
									},
								],
								messages: [],
								result: null,
							});
						},
						{ once: true }
					)
				);
				return;
			}
			msw.use(
				http.get(
					"*/accounts/:accountId/workers/services/:scriptName/environments/:envName",
					({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.scriptName).toEqual(
							options.scriptName || "test-name"
						);
						expect(params.envName).toEqual(options.env);
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: { script },
						});
					},
					{ once: true }
				)
			);
		} else {
			if (!script) {
				msw.use(
					http.get(
						"*/accounts/:accountId/workers/services/:scriptName",
						() => {
							return HttpResponse.json({
								success: false,
								errors: [
									{
										code: 10090,
										message: "workers.api.error.service_not_found",
									},
								],
								messages: [],
								result: null,
							});
						},
						{ once: true }
					)
				);
				return;
			}
			msw.use(
				http.get(
					"*/accounts/:accountId/workers/services/:scriptName",
					({ params }) => {
						expect(params.accountId).toEqual("some-account-id");
						expect(params.scriptName).toEqual(
							options.scriptName || "test-name"
						);
						return HttpResponse.json({
							success: true,
							errors: [],
							messages: [],
							result: {
								default_environment: { environment: "production", script },
							},
						});
					},
					{ once: true }
				)
			);
		}
	}
}

export function mockGetQueueByName(
	queueName: string,
	queue: QueueResponse | null
) {
	const requests = { count: 0 };
	msw.use(
		http.get("*/accounts/:accountId/queues?*", async ({ request }) => {
			const url = new URL(request.url);

			requests.count += 1;
			expect(await request.text()).toEqual("");
			if (queue) {
				const nameParam = url.searchParams.getAll("name");
				expect(nameParam.length).toBeGreaterThan(0);
				expect(nameParam[0]).toEqual(queueName);
			}
			return HttpResponse.json({
				success: true,
				errors: [],
				messages: [],
				result: queue ? [queue] : [],
			});
		})
	);
	return requests;
}

export function mockGetServiceByName(
	serviceName: string,
	defaultEnvironment: string,
	lastDeploymentFrom: "wrangler" | "dash" = "wrangler"
) {
	const requests = { count: 0 };
	const resource = `*/accounts/:accountId/workers/services/:serviceName`;
	msw.use(
		http.get(resource, async ({ params }) => {
			requests.count += 1;
			expect(params.accountId).toEqual("some-account-id");
			expect(params.serviceName).toEqual(serviceName);

			return HttpResponse.json({
				success: true,
				errors: [],
				messages: [],
				result: {
					id: serviceName,
					default_environment: {
						environment: defaultEnvironment,
						script: {
							last_deployed_from: lastDeploymentFrom,
						},
					},
				},
			});
		})
	);
	return requests;
}

export function mockGetScriptWithTags(tags: string[] | null) {
	msw.use(
		http.get(
			"*/accounts/:accountId/workers/services/:scriptName",
			() => {
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: {
						default_environment: {
							environment: "production",
							script: {
								tags,
							},
						},
					},
				});
			},
			{ once: true }
		)
	);
}

export const mockPatchScriptSettings = captureRequestsFrom(
	http.patch(
		`*/accounts/:accountId/workers/scripts/:scriptName/script-settings`,
		async ({ request }) => {
			return HttpResponse.json(createFetchResult(await request.clone().json()));
		}
	)
);

export function mockPutQueueConsumerById(
	expectedQueueId: string,
	expectedQueueName: string,
	expectedConsumerId: string,
	expectedBody: PostTypedConsumerBody
) {
	const requests = { count: 0 };
	msw.use(
		http.put(
			`*/accounts/:accountId/queues/${expectedQueueId}/consumers/${expectedConsumerId}`,
			async ({ request, params }) => {
				const body = await request.json();
				expect(params.accountId).toEqual("some-account-id");
				expect(body).toEqual(expectedBody);
				requests.count += 1;
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: { queue_name: expectedQueueName },
				});
			}
		)
	);
	return requests;
}

export function mockPostConsumerById(
	expectedQueueId: string,
	expectedBody: PostTypedConsumerBody
) {
	const requests = { count: 0 };
	msw.use(
		http.post(
			"*/accounts/:accountId/queues/:queueId/consumers",
			async ({ request, params }) => {
				requests.count += 1;
				expect(params.queueId).toEqual(expectedQueueId);
				expect(params.accountId).toEqual("some-account-id");
				expect(await request.json()).toEqual(expectedBody);
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: {},
				});
			},
			{ once: true }
		)
	);
	return requests;
}

export function mockPostQueueHTTPConsumer(
	expectedQueueId: string,
	expectedBody: PostTypedConsumerBody
) {
	const requests = { count: 0 };
	msw.use(
		http.post(
			`*/accounts/:accountId/queues/:queueId/consumers`,
			async ({ request, params }) => {
				const body = await request.json();
				expect(params.queueId).toEqual(expectedQueueId);
				expect(params.accountId).toEqual("some-account-id");
				expect(body).toEqual(expectedBody);
				requests.count += 1;
				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: {},
				});
			}
		)
	);
	return requests;
}

export const mockAUSRequest = async (
	bodies?: AssetManifest[],
	buckets: string[][] = [[]],
	jwt: string = "<<aus-completion-token>>",
	dispatchNamespace?: string
) => {
	if (dispatchNamespace) {
		msw.use(
			http.post<never, AssetManifest>(
				`*/accounts/some-account-id/workers/dispatch/namespaces/my-namespace/scripts/test-name/assets-upload-session`,
				async ({ request }) => {
					bodies?.push(await request.json());
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: { jwt, buckets },
						},
						{ status: 201 }
					);
				}
			)
		);
	} else {
		msw.use(
			http.post<never, AssetManifest>(
				`*/accounts/some-account-id/workers/scripts/test-name/assets-upload-session`,
				async ({ request }) => {
					bodies?.push(await request.json());
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: { jwt, buckets },
						},
						{ status: 201 }
					);
				}
			)
		);
	}
};

export const mockAssetUploadRequest = async (
	numberOfBuckets: number,
	bodies: FormData[],
	uploadContentTypeHeaders: (string | null)[],
	uploadAuthHeaders: (string | null)[]
) => {
	msw.use(
		http.post(
			"*/accounts/some-account-id/workers/assets/upload",
			async ({ request }) => {
				uploadContentTypeHeaders.push(request.headers.get("Content-Type"));
				uploadAuthHeaders.push(request.headers.get("Authorization"));
				const formData = await request.formData();
				bodies.push(formData);
				if (bodies.length === numberOfBuckets) {
					return HttpResponse.json(
						{
							success: true,
							errors: [],
							messages: [],
							result: { jwt: "<<aus-completion-token>>" },
						},
						{ status: 201 }
					);
				}

				return HttpResponse.json(
					{
						success: true,
						errors: [],
						messages: [],
						result: {},
					},
					{ status: 202 }
				);
			}
		)
	);
};

export function mockGetServiceBindings(
	serviceName: string,
	bindings: WorkerMetadataBinding[]
) {
	const resource = `*/accounts/:accountId/workers/services/:serviceName/environments/:serviceEnvironment/bindings`;
	msw.use(
		http.get(resource, async ({ params }) => {
			expect(params.accountId).toEqual("some-account-id");
			expect(params.serviceName).toEqual(serviceName);

			return HttpResponse.json({
				success: true,
				errors: [],
				messages: [],
				result: bindings,
			});
		})
	);
}

export function mockGetServiceRoutes(
	serviceName: string,
	routes: {
		id: string;
		pattern: string;
		zone_name: string;
		script: string;
	}[]
) {
	const resource = `*/accounts/:accountId/workers/services/:serviceName/environments/:serviceEnvironment/routes`;
	msw.use(
		http.get(resource, async ({ params }) => {
			expect(params.accountId).toEqual("some-account-id");
			expect(params.serviceName).toEqual(serviceName);

			return HttpResponse.json({
				success: true,
				errors: [],
				messages: [],
				result: routes,
			});
		})
	);
}

export function mockGetServiceCustomDomainRecords(
	customDomanRecords: {
		id: string;
		zone_id: string;
		zone_name: string;
		hostname: string;
		service: string;
		environment: string;
		cert_id: string;
	}[]
) {
	msw.use(
		http.get(`*/accounts/:accountId/workers/domains/records`, ({ params }) => {
			expect(params.accountId).toEqual("some-account-id");

			return HttpResponse.json({
				success: true,
				errors: [],
				messages: [],
				result: customDomanRecords,
			});
		})
	);
}

export function mockGetServiceSubDomainData(
	serviceName: string,
	data: {
		enabled: boolean;
		previews_enabled: boolean;
	}
) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/services/:workerName/environments/:serviceEnvironment/subdomain`,
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.workerName).toEqual(serviceName);

				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: data,
				});
			}
		)
	);
}

export function mockGetServiceSchedules(
	serviceName: string,
	data: {
		schedules: {
			cron: string;
			created_on: Date;
			modified_on: Date;
		}[];
	}
) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/scripts/:workerName/schedules`,
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.workerName).toEqual(serviceName);

				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: data,
				});
			}
		)
	);
}

export function mockGetServiceMetadata(
	serviceName: string,
	data: ServiceMetadataRes["default_environment"]
) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/services/:workerName/environments/:serviceEnvironment`,
			({ params }) => {
				expect(params.accountId).toEqual("some-account-id");
				expect(params.workerName).toEqual(serviceName);

				return HttpResponse.json({
					success: true,
					errors: [],
					messages: [],
					result: data,
				});
			}
		)
	);
}

expect.extend({
	async toBeAFileWhichMatches(
		received: File,
		expected: {
			fileBits: string[];
			name: string;
			type: string;
		}
	) {
		const { equals } = this;
		if (!equals(received.name, expected.name)) {
			return {
				pass: false,
				message: () =>
					`${received.name} name does not match ${expected.name} name`,
			};
		}

		if (!equals(received.type, expect.stringMatching(expected.type))) {
			return {
				pass: false,
				message: () =>
					`${received.type} type does not match ${expected.type} type`,
			};
		}

		const receviedText = await received.text();
		const expectedText = await new File(expected.fileBits, expected.name, {
			type: expected.type,
		}).text();
		if (!equals(receviedText, expectedText)) {
			return {
				pass: false,
				message: () =>
					`${receviedText} value does not match ${expectedText} value`,
			};
		}

		return {
			pass: true,
			message: () => "Files are equal",
		};
	},
});

interface CustomMatchers {
	toBeAFileWhichMatches: (expected: {
		fileBits: string[];
		name: string;
		type: string;
	}) => unknown;
}

declare module "vitest" {
	interface Assertion extends CustomMatchers {}
	interface AsymmetricMatchersContaining extends CustomMatchers {}
}
