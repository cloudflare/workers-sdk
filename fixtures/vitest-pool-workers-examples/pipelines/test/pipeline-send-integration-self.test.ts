import { exports } from "cloudflare:workers";
import { it } from "vitest";

it("sends message to pipeline", async ({ expect }) => {
	// Send data to the Pipeline
	const response = await exports.default.fetch("https://example.com/ingest", {
		method: "POST",
		body: "value",
	});
	expect(response.status).toBe(202);
	expect(await response.text()).toBe("Accepted");
});
