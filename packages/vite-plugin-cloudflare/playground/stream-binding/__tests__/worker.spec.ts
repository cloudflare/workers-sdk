import { test } from "vitest";
import { fetchJson, viteTestUrl } from "../../__test-utils__";

test("stream upload returns a valid preview URL", async ({ expect }) => {
	const result = (await fetchJson("/upload")) as {
		preview: string;
		id: string;
	};
	expect(result.id).toBeTruthy();
	expect(result.preview).toContain("/cdn-cgi/mf/stream/");
	expect(result.preview).toContain("/watch");
});

test("stream preview URL host and port match the Vite dev server", async ({
	expect,
}) => {
	const result = (await fetchJson("/upload")) as {
		preview: string;
		id: string;
	};
	const previewUrl = new URL(result.preview);
	const serverUrl = new URL(viteTestUrl);

	expect(previewUrl.hostname).toBe(serverUrl.hostname);
	expect(previewUrl.port).toBe(serverUrl.port);
});
