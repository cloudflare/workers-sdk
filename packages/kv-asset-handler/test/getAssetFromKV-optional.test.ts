import { test, vi } from "vitest";
import { getAssetFromKV } from "../src/index";
import { getEvent, mockGlobalScope, mockRequestScope } from "./mocks";

test("getAssetFromKV return correct val from KV without manifest", async ({
	expect,
}) => {
	mockRequestScope();
	mockGlobalScope();
	// manually reset manifest global, to test optional behaviour
	vi.stubGlobal("__STATIC_CONTENT_MANIFEST", undefined);

	const event = getEvent(new Request("https://blah.com/key1.123HASHBROWN.txt"));
	const res = await getAssetFromKV(event);

	if (res) {
		expect(await res.text()).toBe("val1");
		expect(res.headers.get("content-type")).toContain("text");
	} else {
		expect.fail("Response was undefined");
	}
});
