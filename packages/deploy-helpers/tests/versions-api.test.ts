import { APIError } from "@cloudflare/workers-utils";
import { beforeEach, describe, it, vi } from "vitest";
import { fetchDeploymentVersions } from "../src/deploy/helpers/versions-api";
import { initDeployHelpersContext } from "../src/shared/context";
import type {
	ApiDeployment,
	VersionCache,
} from "../src/deploy/helpers/versions-types";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

// Resolve the waits between attempts immediately, so that retries do not slow
// the tests down.
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn() }));

const deployment: ApiDeployment = {
	id: "some-deployment-id",
	source: "api",
	strategy: "percentage",
	author_email: "",
	created_on: "",
	versions: [
		{ version_id: "version-one", percentage: 10 },
		{ version_id: "version-two", percentage: 90 },
	],
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

describe("fetchDeploymentVersions", () => {
	const fetchResult = vi.fn();

	beforeEach(() => {
		initDeployHelpersContext({
			confirm: (() => {}) as never,
			fetchKVGetValue: (() => {}) as never,
			fetchListResult: (() => {}) as never,
			fetchPagedListResult: (() => {}) as never,
			fetchResult: fetchResult as never,
			logger: {
				debug() {},
				error() {},
				info() {},
				log() {},
				warn() {},
			},
			prompt: (() => {}) as never,
			select: (() => {}) as never,
		});
	});

	/**
	 * Mocks the API for reading a version.
	 *
	 * @param getError Returns the error that a read of a version should fail with, if any. Reads of each version are counted from 1.
	 * @returns The number of times that each version has been read
	 */
	function mockGetVersion(
		getError: (versionId: string, read: number) => APIError | undefined
	): Map<string, number> {
		const reads = new Map<string, number>();
		fetchResult.mockImplementation(
			async (_config: ComplianceConfig, path: string) => {
				const versionId = path.slice(path.lastIndexOf("/") + 1);
				const read = (reads.get(versionId) ?? 0) + 1;
				reads.set(versionId, read);

				const error = getError(versionId, read);
				if (error !== undefined) {
					throw error;
				}
				return { id: versionId };
			}
		);
		return reads;
	}

	/** @returns The versions in the deployment, and the traffic that each one receives */
	function fetchVersionsInDeployment() {
		const versionCache: VersionCache = new Map();
		return fetchDeploymentVersions(
			{},
			"some-account-id",
			"my-worker",
			deployment,
			versionCache
		);
	}

	it("should read each version in the deployment", async ({ expect }) => {
		mockGetVersion(() => undefined);

		const [versions, traffic] = await fetchVersionsInDeployment();

		expect(versions).toEqual([{ id: "version-one" }, { id: "version-two" }]);
		expect([...traffic]).toEqual([
			["version-one", 10],
			["version-two", 90],
		]);
		expect(fetchResult).toHaveBeenCalledWith(
			{},
			"/accounts/some-account-id/workers/scripts/my-worker/versions/version-one"
		);
	});

	it("should retry a version that is temporarily unreadable", async ({
		expect,
	}) => {
		const reads = mockGetVersion((versionId, read) =>
			versionId === "version-one" && read < 4
				? createAPIError(404, 100146)
				: undefined
		);

		const [versions] = await fetchVersionsInDeployment();

		expect(versions).toEqual([{ id: "version-one" }, { id: "version-two" }]);
		// Only the version that could not be read is read again.
		expect([...reads]).toEqual([
			["version-one", 4],
			["version-two", 1],
		]);
	});

	it("should not retry when a version cannot be read for another reason", async ({
		expect,
	}) => {
		const reads = mockGetVersion((versionId) =>
			// 10007: the Worker itself does not exist.
			versionId === "version-one" ? createAPIError(404, 10007) : undefined
		);

		await expect(fetchVersionsInDeployment()).rejects.toMatchObject({
			code: 10007,
		});
		expect(reads.get("version-one")).toBe(1);
	});
});
