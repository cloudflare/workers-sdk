import { expect, test, vi } from "vitest";
import { page, viteTestUrl } from "../../__test-utils__";

async function openWebSocket() {
	await page.goto(viteTestUrl);
	const openButton = page.getByRole("button", { name: "Open WebSocket" });
	const statusTextBefore = await page.textContent("h2");
	expect(statusTextBefore).toBe("WebSocket closed");
	await openButton.click();
	await vi.waitFor(async () => {
		const statusTextAfter = await page.textContent("h2");
		expect(statusTextAfter).toBe("WebSocket open");
	});
}

test("opens WebSocket connection", openWebSocket);

test("closes WebSocket connection", async () => {
	await page.goto(viteTestUrl);
	await openWebSocket();
	const closeButton = page.getByRole("button", { name: "Close WebSocket" });
	const statusTextBefore = await page.textContent("h2");
	expect(statusTextBefore).toBe("WebSocket open");
	await closeButton.click();
	await vi.waitFor(async () => {
		const statusTextAfter = await page.textContent("h2");
		expect(statusTextAfter).toBe("WebSocket closed");
	});
});

test("sends and receives WebSocket string messages", async () => {
	await page.goto(viteTestUrl);
	await openWebSocket();
	const sendButton = page.getByRole("button", { name: "Send string" });
	const messageTextBefore = await page.textContent("p");
	expect(messageTextBefore).toBe("");
	await sendButton.click();
	await vi.waitFor(async () => {
		const messageTextAfter = await page.textContent("p");
		expect(messageTextAfter).toBe(
			`Durable Object received client message: 'Client event' of type 'string'.`
		);
	});
});

test("sends and receives WebSocket ArrayBuffer messages", async () => {
	await page.goto(viteTestUrl);
	await openWebSocket();
	const sendButton = page.getByRole("button", { name: "Send ArrayBuffer" });
	const messageTextBefore = await page.textContent("p");
	expect(messageTextBefore).toBe("");
	await sendButton.click();
	await vi.waitFor(async () => {
		const messageTextAfter = await page.textContent("p");
		expect(messageTextAfter).toBe(
			`Durable Object received client message: '[object ArrayBuffer]' of type 'object'.`
		);
	});
});
