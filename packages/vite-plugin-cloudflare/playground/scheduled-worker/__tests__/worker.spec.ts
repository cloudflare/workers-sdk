import { describe, expect, test } from "vitest";
import { getResponse, getTextResponse, serverLogs } from "../../__test-utils__";

describe("scheduled worker", () => {
	test("Should fail if not /__scheduled", async () => {
		const response = await getResponse();
		expect(response.status()).toBe(500);
	});
	test("Test __scheduled handler", async () => {
		const response = await getTextResponse("/__scheduled?cron=*+*+*+*+*");
		expect(response).toBe("Ran scheduled event");
		const info_logs = serverLogs.info.join();
		expect(info_logs).toContain("__console log__");
		expect(info_logs).toContain("__wait until__");

		let error_logs = serverLogs.errors.join();
		expect(error_logs).toContain("__console error__");
		expect(error_logs).toContain("__console warn__");
		expect(error_logs).not.toContain("__unhandled rejection__");
	});
});
