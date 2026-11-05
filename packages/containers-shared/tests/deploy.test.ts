import { afterEach, describe, it, vi } from "vitest";
import { apply } from "../src/deploy";
import { OpenAPI } from "../src/client/core/OpenAPI";
import type { Application } from "../src/client/models/Application";
import type { ContainerNormalizedConfig } from "../src/types";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Regression tests for cloudflare/workers-sdk#16596:
 * `wrangler deploy` builds the "before" side of the container diff from the
 * applications *listing*, which can lag behind the application itself while a
 * rollout settles, and the error thrown when creating a rollout drops the
 * `request_id` from the API's error body.
 */

const ACCOUNT_ID = "3cd7a955d0a54a6eb5458d1c1d6f299a";
const BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/containers`;
const PATH_BASE = `/client/v4/accounts/${ACCOUNT_ID}/containers`;
const APPLICATION_ID = "8f1f6f0a-7b3f-4cc5-a3e6-6d3ec0adba77";
const DO_NAMESPACE_ID = "do-namespace-id";
const NEW_IMAGE = `registry.cloudflare.com/${ACCOUNT_ID}/my-container@sha256:4e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f`;
const OLD_IMAGE = `registry.cloudflare.com/${ACCOUNT_ID}/my-container@sha256:11223344556677889900aabbccddeeff0011223344556677889900aabbccddeef`;

function makeApplication(image: string, overrides: Partial<Application> = {}) {
	return {
		id: APPLICATION_ID,
		created_at: "2026-10-29T07:00:00Z",
		account_id: ACCOUNT_ID,
		name: "my-container",
		version: 75,
		scheduling_policy: "default",
		instances: 0,
		max_instances: 3,
		configuration: {
			image,
			disk: { size_mb: 2000 },
			memory_mib: 512,
			vcpu: 1,
		},
		constraints: {},
		durable_objects: { namespace_id: DO_NAMESPACE_ID },
		rollout_active_grace_period: 600,
		...overrides,
	} as Application;
}

const containerConfig = {
	name: "my-container",
	class_name: "MyContainer",
	max_instances: 3,
	scheduling_policy: "default",
	rollout_step_percentage: [90, 10],
	rollout_kind: "full_auto",
	rollout_active_grace_period: 600,
	constraints: {},
	observability: { logs_enabled: false },
	disk_bytes: 2_000_000_000,
	memory_mib: 512,
	vcpu: 1,
	dockerfile: "/project/Dockerfile",
	image_build_context: "/project",
} as ContainerNormalizedConfig;

const config = {
	configPath: "/project/wrangler.jsonc",
	containers: [{ name: "my-container", class_name: "MyContainer" }],
} as unknown as Config;

const applyArgs = {
	imageRef: { remoteDigest: NEW_IMAGE },
	durable_object_namespace_id: DO_NAMESPACE_ID,
	configFileName: "wrangler.jsonc",
	observabilityTargetPercentageField: "target_instance_percentage",
	observabilityTargetCountField: "target_instance_count",
};

type RecordedRequest = { method: string; path: string };

describe("containers deploy apply()", () => {
	let recordedRequests: RecordedRequest[] = [];

	function json(body: unknown, status = 200) {
		return new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}

	function ok(result: unknown) {
		return json({ success: true, result });
	}

	function stubContainersApi(options: {
		listedApplication: Application;
		applicationById: Application;
		rollouts: () => Response;
	}) {
		recordedRequests = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
				const url =
					typeof input === "string"
						? new URL(input)
						: input instanceof URL
							? input
							: new URL(input.url);
				const method = init?.method ?? "GET";
				const path = url.pathname;
				recordedRequests.push({ method, path });

				switch (`${method} ${path}`) {
					case `GET ${PATH_BASE}/applications`:
						return ok([options.listedApplication]);
					case `GET ${PATH_BASE}/applications/${APPLICATION_ID}`:
						return ok(options.applicationById);
					case `PATCH ${PATH_BASE}/applications/${APPLICATION_ID}`:
						return ok(options.applicationById);
					case `POST ${PATH_BASE}/applications/${APPLICATION_ID}/rollouts`:
						return options.rollouts();
					default:
						throw new Error(`Unexpected request: ${method} ${path}`);
				}
			})
		);
	}

	afterEach(() => {
		vi.unstubAllGlobals();
		OpenAPI.BASE = "";
	});

	it("does not patch or roll out an application whose current state already matches the deployment, even when the applications listing is stale (#16596)", async ({ expect }) => {
		OpenAPI.BASE = BASE_URL;
		// The applications listing lags one version behind: it still reports the
		// application at its previous version, with the previous image and an
		// active rollout. The application itself has already completed that
		// rollout and runs the image this deploy pushes.
		const staleListing = makeApplication(OLD_IMAGE, {
			version: 74,
			active_rollout_id: "rollout-74",
		});
		const currentApplication = makeApplication(NEW_IMAGE, { version: 75 });
		stubContainersApi({
			listedApplication: staleListing,
			applicationById: currentApplication,
			rollouts: () => ok({ id: "rollout-spurious" }),
		});

		await apply(
			applyArgs,
			containerConfig,
			config,
			ACCOUNT_ID
		);

		const writes = recordedRequests.filter(
			(request) => request.method !== "GET"
		);
		expect(writes).toEqual([]);
	});

	it("includes the API request_id in the error thrown when creating a rollout fails (#16596)", async ({ expect }) => {
		OpenAPI.BASE = BASE_URL;
		// A real image change is pending, so a rollout is genuinely needed.
		const previousApplication = makeApplication(OLD_IMAGE, { version: 75 });
		stubContainersApi({
			listedApplication: previousApplication,
			applicationById: previousApplication,
			rollouts: () =>
				json({
					error: JSON.stringify({
						error: "Internal Server Error",
						request_id: "cf-rollout-9f1c2b",
					}),
				}, 500),
		});

		await expect(
			apply(applyArgs, containerConfig, config, ACCOUNT_ID)
		).rejects.toThrowError("cf-rollout-9f1c2b");
	});
});
