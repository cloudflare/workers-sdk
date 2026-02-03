import { expect, test, vi } from "vitest";
import { page, WAIT_FOR_OPTIONS } from "../../__test-utils__";

test("sends and receives PartyServer messages", async () => {
	const sendButton = page.getByRole("button", { name: "Send message" });
	const messageTextBefore = await page.textContent("p");
	expect(messageTextBefore).toBe("");
	await sendButton.click();
	await vi.waitFor(async () => {
		const messageTextAfter = await page.textContent("p");
		expect(messageTextAfter).toBe(
			`Message from the server: received 'Hello from the client!'`
		);
	}, WAIT_FOR_OPTIONS);
});
