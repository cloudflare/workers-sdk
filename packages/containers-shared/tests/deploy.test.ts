import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultWranglerConfig } from "@cloudflare/workers-utils";
import type { Config, Logger } from "@cloudflare/workers-utils";
import { initContainersSharedContext } from "../src/context";
import { createDurableObjectNamespaceResolver } from "../src/deploy";

const SCRIPT_NAME = "my-worker";
const VERSION_ID = "00000000-0000-0000-0000-000000000001";
const ACCOUNT_ID = "account-1";
const CLASS_NAME = "MyContainer";
const NAMESPACE_ID = "namespace-123";

/**
 * The Cloudflare Versions API is eventually consistent: a version Wrangler has
 * just uploaded may keep answering 100146 for a few seconds (#16717). We mock
 * `setTimeout` from node:timers/promises so each retry delay only advances a
 * virtual clock instead of sleeping, and have the mocked API keep returning
 * 100146 until that clock passes the point at which the version becomes
 * readable.
 */
const VERSION_VISIBLE_AFTER_MS = 3000;

let virtualClockMs = 0;

vi.mock("node:timers/promises", () => ({
	setTimeout: vi.fn(async (ms: number) => {
		virtualClockMs += ms;
	}),
}));

const logger: Logger = {
	debug: () => {},
	log: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

function notYetVisibleError(): Error {
	// The shape wrangler's fetchResult rejects with for API error 100146
	return Object.assign(
		new Error(
			"The requested Worker version could not be found, please check the ID being passed and try again."
		),
		{ code: 100146 }
	);
}

const uploadedVersion = {
	resources: {
		bindings: [
			{
				type: "durable_object_namespace",
				name: "CONTAINER",
				class_name: CLASS_NAME,
				script_name: SCRIPT_NAME,
				namespace_id: NAMESPACE_ID,
			},
		],
	},
};

const config = {
	...defaultWranglerConfig,
	durable_objects: {
		bindings: [{ name: "CONTAINER", class_name: CLASS_NAME }],
	},
} as Config;

function makeResolver(fetchResult: (resource: string) => Promise<unknown>) {
	initContainersSharedContext({
		logger,
		fetchResult: (_complianceConfig, resource) => fetchResult(resource),
	});
	return createDurableObjectNamespaceResolver(config, {
		versionId: VERSION_ID,
		accountId: ACCOUNT_ID,
		scriptName: SCRIPT_NAME,
	});
}

beforeEach(() => {
	virtualClockMs = 0;
});

describe("createDurableObjectNamespaceResolver", () => {
	it("keeps retrying the read-back of a just-uploaded version until the API makes it visible (#16717)", async () => {
		const fetchUploadedVersion = vi.fn(async () => {
			if (virtualClockMs < VERSION_VISIBLE_AFTER_MS) {
				throw notYetVisibleError();
			}
			return uploadedVersion;
		});

		const namespaceId = await makeResolver(fetchUploadedVersion)(CLASS_NAME);

		expect(namespaceId).toBe(NAMESPACE_ID);
	});

	it("does not retry read-back failures other than 100146 for the uploaded version", async () => {
		const fetchUploadedVersion = vi.fn(async () => {
			throw Object.assign(new Error("Authentication error"), { code: 10000 });
		});

		await expect(
			makeResolver(fetchUploadedVersion)(CLASS_NAME)
		).rejects.toMatchObject({ code: 10000 });
		expect(fetchUploadedVersion).toHaveBeenCalledTimes(1);
	});
});
