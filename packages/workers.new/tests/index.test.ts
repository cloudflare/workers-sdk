import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("worker", () => {
	it("python workers", async () => {
		const resp = await SELF.fetch(`https://workers.new/python`, {
			redirect: "manual",
		});

		const location = resp.headers.get("Location");

		expect(location).toMatchInlineSnapshot(
			'"https://workers.cloudflare.com/playground/python"'
		);
	});
});
