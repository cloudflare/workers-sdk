import { resolve } from "path";
import { describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

const basePath = resolve(__dirname, "..");

describe("'wrangler dev' errors because redirected configs can't include environments", () => {
	it("uses the generated config", async ({ expect }) => {
		await expect(
			runWranglerDev(basePath, ["--port=0", "--inspector-port=0"])
		).rejects.toThrowError(
			/Redirected configurations cannot include environments, instead the following have been found: \"staging\"/
		);
	});
});
