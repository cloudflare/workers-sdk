import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

const basePath = resolve(__dirname, "..");

describe("'wrangler dev' errors when a redirected config includes environments", () => {
	it("A clear error message is presented which includes the offending environments and prompting the user to contact the tool's author", async () => {
		let error: string | undefined;
		try {
			await runWranglerDev(basePath, ["--port=0", "--inspector-port=0"]);
		} catch (e) {
			if (typeof e === "string") {
				error = e;
			}
		}
		expect(error).toBeTruthy();
		expect(error).toMatch(
			/Redirected configurations cannot include environments but the following have been found:/
		);
		expect(error).toContain("staging");
		expect(error).toContain("testing");

		expect(error).toContain("Report this issue to the tool's author");
	});
});
