import { test, vi } from "vitest";
import {
	getTextResponse,
	isCINonLinux,
	isLocalWithoutDockerRunning,
	viteTestUrl,
	WAIT_FOR_OPTIONS,
} from "../../__test-utils__";

// The Cloudflare-managed registry image referenced in `wrangler.registry.jsonc`
// lives under this account, so we can only successfully pull it when running
// against that account. The account id must match the path segment in the image
// URL (`registry.cloudflare.com/<ACCOUNT_ID>/ci-container-dont-delete:latest`).
const DEVPROD_TESTING_ACCOUNT_ID = "8d783f274e1f82dc46744c297b015a2f";
const isDevProdTestingAccount =
	process.env.CLOUDFLARE_ACCOUNT_ID === DEVPROD_TESTING_ACCOUNT_ID;

// We can only really run these tests on Linux, because we build our images for linux/amd64,
// and github runners don't really support container virtualization in any sane way.
const skipContainerTests =
	isCINonLinux ||
	// If the test is being run locally and docker is not running we just skip these tests
	isLocalWithoutDockerRunning;

test.skipIf(skipContainerTests)(
	"starts container built from local Dockerfile",
	async ({ expect }) => {
		const startResponse = await getTextResponse("/dockerfile/start");
		expect(startResponse).toBe("Container create request sent...");

		const statusResponse = await getTextResponse("/dockerfile/status");
		expect(statusResponse).toBe("true");

		await vi.waitFor(async () => {
			const fetchResponse = await fetch(`${viteTestUrl}/dockerfile/fetch`, {
				signal: AbortSignal.timeout(500),
			});
			expect(await fetchResponse.text()).toBe("Hello World!");
		}, WAIT_FOR_OPTIONS);
	}
);

// The registry-based test only runs when we are authenticated against the
// devprod testing account that owns the `ci-container-dont-delete` image.
test.skipIf(skipContainerTests || !isDevProdTestingAccount)(
	"starts container pulled from the Cloudflare-managed registry",
	async ({ expect }) => {
		const startResponse = await getTextResponse("/registry/start");
		expect(startResponse).toBe("Container create request sent...");

		const statusResponse = await getTextResponse("/registry/status");
		expect(statusResponse).toBe("true");

		await vi.waitFor(async () => {
			const fetchResponse = await fetch(`${viteTestUrl}/registry/fetch`, {
				signal: AbortSignal.timeout(500),
			});
			expect(await fetchResponse.text()).toBe(
				"Hello World! Have an env var! from vite"
			);
		}, WAIT_FOR_OPTIONS);
	}
);
