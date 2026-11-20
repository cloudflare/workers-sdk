import { setTimeout } from "node:timers/promises";
import { APIError } from "@cloudflare/workers-utils";
import { beforeEach, describe, it, vi } from "vitest";
import {
	createDurableObjectNamespaceResolver,
	initContainersSharedContext,
} from "../index";
import type { FetchResultFetcher, Logger } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils/config";

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
		bindings: [{ name: "CONTAINER", class_name: "MyContainer" }],
	},
} as unknown as Config;

function versionNotFoundError() {
	const error = new APIError({
		text: "A request to the Cloudflare API failed.",
		status: 404,
		telemetryMessage: false,
	});
	error.code = 100146;
	return error;
}

describe("createDurableObjectNamespaceResolver", () => {
	beforeEach(() => {
		vi.mocked(setTimeout).mockResolvedValue(undefined);
	});

	it("waits for the uploaded version to become readable", async ({
		expect,
	}) => {
		const fetchResult = vi.fn().mockResolvedValue({
			id: "version-id",
			resources: {
				bindings: [
					{
						type: "durable_object_namespace",
						name: "CONTAINER",
						class_name: "MyContainer",
						namespace_id: "namespace-id",
					},
				],
			},
		});
		for (let i = 0; i < 5; i++) {
			fetchResult.mockRejectedValueOnce(versionNotFoundError());
		}
		initContainersSharedContext({
			logger,
			fetchResult: fetchResult as unknown as FetchResultFetcher,
		});

		const resolveNamespaceId = createDurableObjectNamespaceResolver(config, {
			versionId: "version-id",
			accountId: "account-id",
			scriptName: "my-worker",
			dispatchNamespace: undefined,
		});

		await expect(resolveNamespaceId("MyContainer")).resolves.toBe(
			"namespace-id"
		);
		expect(fetchResult).toHaveBeenCalledTimes(6);
		expect(fetchResult).toHaveBeenCalledWith(
			config,
			"/accounts/account-id/workers/scripts/my-worker/versions/version-id"
		);
	});
});
