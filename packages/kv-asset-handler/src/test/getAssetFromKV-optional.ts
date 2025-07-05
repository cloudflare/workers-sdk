import test from "ava";
import { getEvent, mockGlobalScope, mockRequestScope } from "../mocks";

mockGlobalScope();

// @ts-expect-error we use a require for a mock
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getAssetFromKV } = require("../index");
// manually reset manifest global, to test optional behaviour
Object.assign(globalThis, { __STATIC_CONTENT_MANIFEST: undefined });

test("getAssetFromKV return correct val from KV without manifest", async (t) => {
	mockRequestScope();
	// manually reset manifest global, to test optional behaviour
	Object.assign(globalThis, { __STATIC_CONTENT_MANIFEST: undefined });

	const event = getEvent(new Request("https://blah.com/key1.123HASHBROWN.txt"));
	const res = await getAssetFromKV(event);

	if (res) {
		t.is(await res.text(), "val1");
		t.true(res.headers.get("content-type").includes("text"));
	} else {
		t.fail("Response was undefined");
	}
});
