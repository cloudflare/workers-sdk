import { expect, test } from "vitest";
import { page } from "../../__test-utils__";
import { port } from "./serve";

const url = `http://localhost:${port}`;

test("returns correct response", async () => {
	const responsePromise = page.waitForResponse(url);
	await page.goto(url);
	const response = await responsePromise;
	const value = await response.text();

	expect(value).toEqual("Cloudflare-Workers");
});
