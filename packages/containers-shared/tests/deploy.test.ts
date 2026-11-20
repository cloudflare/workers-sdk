import { APIError } from "@cloudflare/workers-utils";
import { beforeEach, describe, it, vi } from "vitest";
import { initContainersSharedContext } from "../src/context";
import { createDurableObjectNamespaceResolver } from "../src/deploy";
import type { FetchResultFetcher, Logger } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils/config";

// Resolve the waits between attempts immediately, so that a full retry schedule
// can run in a unit test.
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn() }));

const logger: Logger = {
	debug: vi.fn(),
	log: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

const config = {
	durable_objects: {
		bindings: [{ name: "MY_CONTAINER", class_name: "MyContainer" }],
	},
} as unknown as Config;

const uploadedVersion = {
	resources: {
		bindings: [
			{
				type: "durable_object_namespace",
				name: "MY_CONTAINER",
				class_name: "MyContainer",
				namespace_id: "some-namespace-id",
			},
		],
	},
};

/**
 * @param status The HTTP status of the response
 * @param code The Cloudflare API error code in the response
 * @returns The error for a failed request to the Cloudflare API
 */
function createAPIError(status: number, code: number): APIError {
	const error = new APIError({
		status,
		text: "A request to the Cloudflare API failed.",
		telemetryMessage: false,
	});
	error.code = code;
	return error;
}

describe("createDurableObjectNamespaceResolver", () => {
	const fetchResultMock = vi.fn();

	beforeEach(() => {
		fetchResultMock.mockReset();
		initContainersSharedContext({
			logger,
			fetchResult: fetchResultMock as FetchResultFetcher,
		});
	});

	/** @returns The namespace ID of the Durable Object bound to the uploaded version */
	function resolveNamespaceId(): Promise<string> {
		const resolve = createDurableObjectNamespaceResolver(config, {
			versionId: "some-version-id",
			accountId: "some-account-id",
			scriptName: "my-worker",
		});
		return resolve("MyContainer");
	}

	it("should read the namespace ID from the uploaded version", async ({
		expect,
	}) => {
		fetchResultMock.mockResolvedValue(uploadedVersion);

		await expect(resolveNamespaceId()).resolves.toBe("some-namespace-id");
		expect(fetchResultMock).toHaveBeenCalledExactlyOnceWith(
			config,
			"/accounts/some-account-id/workers/scripts/my-worker/versions/some-version-id"
		);
	});

	it("should retry while the uploaded version is temporarily unreadable", async ({
		expect,
	}) => {
		// More failures than the read used to tolerate.
		for (let failure = 0; failure < 8; failure++) {
			fetchResultMock.mockRejectedValueOnce(createAPIError(404, 100146));
		}
		fetchResultMock.mockResolvedValue(uploadedVersion);

		await expect(resolveNamespaceId()).resolves.toBe("some-namespace-id");
		expect(fetchResultMock).toHaveBeenCalledTimes(9);
	});

	it("should fail when the uploaded version stays unreadable", async ({
		expect,
	}) => {
		fetchResultMock.mockRejectedValue(createAPIError(404, 100146));

		await expect(resolveNamespaceId()).rejects.toMatchObject({ code: 100146 });
		expect(fetchResultMock).toHaveBeenCalledTimes(12);
	});

	it("should not retry when something else cannot be found", async ({
		expect,
	}) => {
		// 10007: the Worker itself does not exist.
		fetchResultMock.mockRejectedValue(createAPIError(404, 10007));

		await expect(resolveNamespaceId()).rejects.toMatchObject({ code: 10007 });
		expect(fetchResultMock).toHaveBeenCalledTimes(1);
	});

	it("should not retry when the API is failing", async ({ expect }) => {
		fetchResultMock.mockRejectedValue(createAPIError(500, 10000));

		await expect(resolveNamespaceId()).rejects.toMatchObject({ status: 500 });
		expect(fetchResultMock).toHaveBeenCalledTimes(1);
	});
});
