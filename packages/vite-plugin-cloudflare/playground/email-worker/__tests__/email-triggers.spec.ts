import { expect, test, vi } from "vitest";
import { getTextResponse, viteTestUrl } from "../../__test-utils__";

test("Supports sending email via the email binding", async () => {
	const rootResponse = await getTextResponse("/");
	expect(rootResponse).toBe("Hello Email Workers playground!");

	const sendEmailResponse = await getTextResponse("/send");
	expect(sendEmailResponse).toBe("Email message sent successfully!");

	await vi.waitFor(
		async () => {
			const params = new URLSearchParams();
			params.append("from", "sender@example.com");
			params.append("to", "recipient@example.com");

			const fetchResponse = await fetch(
				`${viteTestUrl}/cdn-cgi/handler/email?${params}`,
				{
					method: "POST",
					body: `From: "John" <sender@example.com>
Reply-To: sender@example.com
To: recipient@example.com
Subject: Testing Email Workers Local Dev
Content-Type: text/html; charset="windows-1252"
X-Mailer: Curl
Date: Tue, 27 Aug 2024 08:49:44 -0700
Message-ID: <6114391943504294873000@ZSH-GHOSTTY>

Hi there`,
				}
			);
			expect(await fetchResponse.text()).toBe(
				"Worker successfully processed email"
			);
		},
		{ timeout: 2000, interval: 500 }
	);
});
