import { test, vi } from "vitest";
import {
	getTextResponse,
	isCINonLinux,
	isLocalWithoutDockerRunning,
	viteTestUrl,
	WAIT_FOR_OPTIONS,
} from "../../__test-utils__";

// We can only really run these tests on Linux, because we build our images for linux/amd64,
// and github runners don't really support container virtualization in any sane way
test.skipIf(
	isCINonLinux ||
		// If the test is being run locally and docker is not running we just skip this test
		isLocalWithoutDockerRunning
)("starts container", async ({ expect }) => {
	const startResponse = await getTextResponse("/start");
	expect(startResponse).toBe("Container create request sent...");

	const statusResponse = await getTextResponse("/status");
	expect(statusResponse).toBe("true");

	await vi.waitFor(async () => {
		const fetchResponse = await fetch(`${viteTestUrl}/fetch`, {
			signal: AbortSignal.timeout(500),
		});
		expect(await fetchResponse.text()).toBe("Hello World!");
	}, WAIT_FOR_OPTIONS);
});
