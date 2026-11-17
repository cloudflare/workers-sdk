import {
	runInTempDir,
	writeWranglerConfig,
} from "@cloudflare/workers-utils/test-helpers";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, test } from "vitest";
import { collectCLIOutput } from "../helpers/collect-cli-output";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { useMockIsTTY } from "../helpers/mock-istty";
import {
	createFetchResult,
	msw,
	mswGetVersion,
	mswListNewDeployments,
	mswListVersions,
	mswPatchNonVersionedScriptSettings,
	mswPostNewDeployment,
	mswSuccessDeploymentScriptMetadata,
} from "../helpers/msw";
import { runWrangler } from "../helpers/run-wrangler";

// A freshly uploaded version, not part of the current deployment
const VERSION_ID = "40000000-0000-0000-0000-000000000000";

/**
 * The Workers Versions API is eventually consistent: right after
 * `wrangler versions upload`, reads of the new version can return 100146
 * ("The requested Worker version could not be found") for a few seconds,
 * alternating with successful reads (#16717). Creating the deployment is not
 * affected; only the reads are.
 *
 * Makes the GET of VERSION_ID answer 100146 on the reads whose 1-based number
 * is in `notFoundOnReads`, and falls through to the default mock otherwise.
 */
function mswVersionNotYetVisibleOnReads(notFoundOnReads: number[]) {
	const reads = { count: 0 };
	const handler = http.get(
		`*/accounts/:accountId/workers/scripts/:workerName/versions/${VERSION_ID}`,
		() => {
			reads.count++;
			if (notFoundOnReads.includes(reads.count)) {
				return HttpResponse.json(
					createFetchResult(null, false, [
						{
							code: 100146,
							message:
								"The requested Worker version could not be found, please check the ID being passed and try again.",
						},
					]),
					{ status: 404 }
				);
			}
			// fall through to the default mswGetVersion() handler
			return undefined;
		}
	);
	return { handler, reads };
}

describe("versions deploy of a just-uploaded version (#16717)", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();
	mockConsoleMethods();
	collectCLIOutput();
	const { setIsTTY } = useMockIsTTY();

	beforeEach(() => {
		setIsTTY(false);
		writeWranglerConfig();
		msw.use(
			mswListNewDeployments,
			mswListVersions,
			mswGetVersion(),
			mswPostNewDeployment,
			mswPatchNonVersionedScriptSettings,
			...mswSuccessDeploymentScriptMetadata
		);
	});

	test("does not fail when a read after the version was already found briefly returns 100146", async ({
		expect,
	}) => {
		// The first read (to show and confirm the version) succeeds; the next
		// read of the same version id returns 100146 once, then it is readable.
		const { handler } = mswVersionNotYetVisibleOnReads([2]);
		msw.use(handler);

		await expect(
			runWrangler(`versions deploy ${VERSION_ID} --yes`)
		).resolves.toBeUndefined();
	});

	test("retries the first read of a version that is not yet readable", async ({
		expect,
	}) => {
		// The version returns 100146 on its first read, then is readable.
		const { handler, reads } = mswVersionNotYetVisibleOnReads([1]);
		msw.use(handler);

		await expect(
			runWrangler(`versions deploy ${VERSION_ID} --yes`)
		).resolves.toBeUndefined();
		expect(reads.count).toBeGreaterThan(1);
	});
});
