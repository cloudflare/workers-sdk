import { expect, test } from "vitest";
import { isBuild, serverLogs } from "../../__test-utils__";

test.runIf(!isBuild)("client receives custom events", async () => {
	expect(serverLogs.info.join()).toContain("__server-event-data-received__");
});

test.runIf(!isBuild)("server receives custom events", async () => {
	expect(serverLogs.info.join()).toContain("__client-event-data-received__");
});
