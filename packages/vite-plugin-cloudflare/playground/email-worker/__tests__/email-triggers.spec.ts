import dedent from "ts-dedent";
import { expect, test } from "vitest";
import { getTextResponse, serverLogs, viteTestUrl } from "../../__test-utils__";

test("Supports sending email via the email binding", async () => {
	const sendEmailResponse = await getTextResponse("/send");
	expect(sendEmailResponse).toBe("Email message sent successfully!");
});

test("Supports testing Email Workers at '/cdn-cgi/handler/scheduled' route", async () => {
	const params = new URLSearchParams();
	params.append("from", "sender@example.com");
	params.append("to", "recipient@example.com");

	const fetchResponse = await fetch(
		`${viteTestUrl}/cdn-cgi/handler/email?${params}`,
		{
			method: "POST",
			body: dedent`
				From: "John" <sender@example.com>
				Reply-To: sender@example.com
				To: recipient@example.com
				Subject: Testing Email Workers Local Dev
				Content-Type: text/html; charset="windows-1252"
				X-Mailer: Curl
				Date: Tue, 27 Aug 2024 08:49:44 -0700
				Message-ID: <6114391943504294873000@ZSH-GHOSTTY>

				Hi there
			`,
		}
	);

	const emailStdout = serverLogs.info.join();
	expect(await fetchResponse.text()).toBe(
		"Worker successfully processed email"
	);
	expect(emailStdout).toContain(
		`Received email from sender@example.com on ${new Date(" 27 Aug 2024 08:49:44 -0700").toISOString()} with following message:`
	);
	expect(emailStdout).toContain("Hi there");
});
