import { publish } from "..";

beforeEach(() => {
	// @ts-expect-error mocked fetch
	fetch.reset();
});

describe("publish", () => {
	it("should publish to the endpoint", async () => {
		const script = 'console.log("hello world")';

		const response = await publish(script, {
			scriptId: "testScriptId",
			accountId: "testAccountId",
			apiToken: "testToken",
			namespace: "testNS",
			tags: ["testTag"],
			format: "service-worker",
			compatibility_date: "test-date",
			compatibility_flags: ["test-flag"],
		});
	});
});
