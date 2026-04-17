import { test } from "vitest";
import { fetchJson, viteTestUrl } from "../../__test-utils__";
import { CONFIGURED_PORT } from "./serve";

test("stream upload returns a valid preview URL", async ({ expect }) => {
	const result = (await fetchJson("/upload")) as {
		preview: string;
		id: string;
	};
	expect(result.id).toBeTruthy();
	expect(result.preview).toContain("/cdn-cgi/mf/stream/");
	expect(result.preview).toContain("/watch");
});

test("stream preview URL port matches actual server port after port bump", async ({
	expect,
}) => {
	// Verify that Vite actually bumped the port (the blocker occupies CONFIGURED_PORT)
	const serverUrl = new URL(viteTestUrl);
	expect(Number(serverUrl.port)).not.toBe(CONFIGURED_PORT);

	const result = (await fetchJson("/upload")) as {
		preview: string;
		id: string;
	};
	const previewUrl = new URL(result.preview);

	expect(previewUrl.hostname).toBe(serverUrl.hostname);
	expect(previewUrl.port).toBe(serverUrl.port);
});
