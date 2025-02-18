import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("sends message to pipeline", async () => {
	// Send data to the Pipeline
	let response = await SELF.fetch("https://example.com/ingest", {
		method: "POST",
		body: "value",
	});
	expect(response.status).toBe(202);
	expect(await response.text()).toBe("Accepted");
});
