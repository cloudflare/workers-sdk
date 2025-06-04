import { createConnection } from "node:net";
import { expect, test } from "vitest";
import { page } from "../../__test-utils__";
import { viteTestUrl } from "../../vitest-setup";

test("returns the correct home page", async () => {
	const content = await page.textContent("h1");
	expect(content).toBe("Vite + React");
});

test("returns the response from the API", async () => {
	const button = page.getByRole("button", { name: "get-name" });
	const contentBefore = await button.innerText();
	expect(contentBefore).toBe("Name from API is: unknown");
	const responsePromise = page.waitForResponse((response) =>
		response.url().endsWith("/api/")
	);
	await button.click();
	await responsePromise;
	const contentAfter = await button.innerText();
	expect(contentAfter).toBe("Name from API is: Cloudflare");
});

test("returns the home page even for 404-y pages", async () => {
	await page.goto(`${viteTestUrl}/foo`);
	const content = await page.textContent("h1");
	expect(content).toBe("Vite + React");
});

test("returns the home page even for API-y pages", async () => {
	await page.goto(`${viteTestUrl}/api/`);
	const content = await page.textContent("h1");
	expect(content).toBe("Vite + React");
});

test("requests made with/without explicit 'sec-fetch-mode: navigate' header to delegate correctly", async () => {
	const responseWithoutHeader = await fetch(`${viteTestUrl}/foo`);
	expect(responseWithoutHeader.status).toBe(404);
	expect(await responseWithoutHeader.text()).toEqual("nothing here");

	// can't make `fetch`es with `sec-fetch-mode: navigate` header, so we're doing it raw
	const { hostname, port } = new URL(viteTestUrl);
	const socket = createConnection(parseInt(port), hostname, () => {
		socket.write(
			`GET /foo HTTP/1.1\r\nHost: ${hostname}\r\nSec-Fetch-Mode: navigate\r\n\r\n`
		);
	});

	let responseWithoutHeaderContentBuffer = "";
	socket.on("data", (data) => {
		responseWithoutHeaderContentBuffer += data.toString();
	});

	const responseWithoutHeaderContent = await new Promise((resolve) =>
		socket.on("close", () => {
			resolve(responseWithoutHeaderContentBuffer);
		})
	);

	expect(responseWithoutHeaderContent).toContain("Vite + React");
});
