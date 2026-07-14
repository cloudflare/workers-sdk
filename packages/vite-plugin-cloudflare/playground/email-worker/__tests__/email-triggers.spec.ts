import { readFileSync } from "node:fs";
import path from "node:path";
import dedent from "ts-dedent";
import { describe, test, vi } from "vitest";
import {
	getTextResponse,
	rootDir,
	serverLogs,
	slash,
	viteTestUrl,
	WAIT_FOR_OPTIONS,
} from "../../__test-utils__";

test("Supports sending email via the email binding", async ({ expect }) => {
	const sendEmailResponse = await getTextResponse("/send");
	expect(sendEmailResponse).toBe("Email message sent successfully!");
});

// The canonical path is `/cdn-cgi/local/email`; `/cdn-cgi/handler/email` is the
// legacy path kept working via a rewrite in the trigger-handlers plugin.
describe.each(["/cdn-cgi/local/email", "/cdn-cgi/handler/email"])(
	"%s",
	(path) => {
		test("Supports testing Email Workers", async ({ expect }) => {
			const params = new URLSearchParams();
			params.append("from", "sender@example.com");
			params.append("to", "recipient@example.com");

			const fetchResponse = await fetch(`${viteTestUrl}${path}?${params}`, {
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
			});

			const emailStdout = serverLogs.info.join();
			expect(await fetchResponse.text()).toBe(
				"Worker successfully processed email"
			);
			expect(emailStdout).toContain(
				`Received email from sender@example.com on ${new Date(" 27 Aug 2024 08:49:44 -0700").toISOString()} with following message:`
			);
			expect(emailStdout).toContain("Hi there");
		});
	}
);

test("logs sent emails to a directory within the project directory", async ({
	expect,
}) => {
	const sendEmailResponse = await getTextResponse("/send");
	expect(sendEmailResponse).toBe("Email message sent successfully!");

	// The send_email binding writes the raw email to disk and logs the path.
	const loggedPath = await vi.waitFor(() => {
		const logs = serverLogs.info.join("\n");
		expect(logs).toContain(
			"send_email binding called with the following message:"
		);
		const match = logs.match(/^Email: (.+)$/m);
		const emailPath = match?.[1]?.trim();
		expect(emailPath).toBeTruthy();
		return emailPath as string;
	}, WAIT_FOR_OPTIONS);

	const projectEmailDir = slash(
		path.join(rootDir, ".wrangler", "tmp", "email")
	);
	expect(slash(loggedPath).startsWith(projectEmailDir)).toBe(true);

	const fileContents = readFileSync(loggedPath, "utf-8");
	expect(fileContents).toContain(
		"Congratulations, you just sent an email from a Worker."
	);
});
