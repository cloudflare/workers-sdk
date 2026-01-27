import { EmailMessage } from "cloudflare:email";
import { env, WorkerEntrypoint } from "cloudflare:workers";
import { createMimeMessage } from "mimetext";

export default class extends WorkerEntrypoint<Env> {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/error") throw new Error("Hello Error");

		// Original EmailMessage API (raw MIME)
		if (url.pathname === "/send") {
			const msg = createMimeMessage();
			msg.setSender({ name: "GPT-4", addr: "sender@penalosa.cloud" });
			msg.setRecipient("else@example.com");
			msg.setSubject("An email generated in a Worker");
			msg.addMessage({
				contentType: "text/plain",
				data: "Congratulations, you just sent an email from a Worker.",
			});
			const m = new EmailMessage(
				"sender@penalosa.cloud",
				"else@example.com",
				msg.asRaw()
			);
			await this.env.LIST_SEND.send(m);
			return new Response(
				"✅ EmailMessage sent! Check console for temp file path.\n"
			);
		}

		// MessageBuilder API: Simple text-only email
		if (url.pathname === "/send-simple") {
			await this.env.LIST_SEND.send({
				from: { name: "Alice", email: "sender@penalosa.cloud" },
				to: "else@example.com",
				subject: "Simple MessageBuilder Test",
				text: "This is a plain text email using the MessageBuilder API!",
			} as any);
			return new Response(
				"✅ Simple text email sent! Check console for temp file path.\n"
			);
		}

		// MessageBuilder API: Email with both text and HTML
		if (url.pathname === "/send-html") {
			await this.env.LIST_SEND.send({
				from: { name: "Bob", email: "sender@penalosa.cloud" },
				to: "else@example.com",
				subject: "HTML Email Test",
				text: "This is the plain text version.",
				html: `
<!DOCTYPE html>
<html>
<head>
	<style>
		body { font-family: Arial, sans-serif; }
		.highlight { color: #0066cc; font-weight: bold; }
	</style>
</head>
<body>
	<h1>Hello from MessageBuilder!</h1>
	<p>This is the <span class="highlight">HTML</span> version.</p>
	<ul>
		<li>Feature 1</li>
		<li>Feature 2</li>
		<li>Feature 3</li>
	</ul>
</body>
</html>
				`.trim(),
			} as any);
			return new Response(
				"✅ HTML email sent! Check console for text and HTML file paths.\n"
			);
		}

		// MessageBuilder API: Email with text attachment
		if (url.pathname === "/send-attachment") {
			const textContent = new TextEncoder().encode(
				"This is a sample text file attachment.\n\nLine 2\nLine 3\n"
			);

			await this.env.LIST_SEND.send({
				from: "sender@penalosa.cloud",
				to: "else@example.com",
				subject: "Email with Text Attachment",
				text: "Please see the attached text file.",
				attachments: [
					{
						disposition: "attachment",
						filename: "sample.txt",
						type: "text/plain",
						content: textContent,
					},
				],
			} as any);
			return new Response(
				"✅ Email with text attachment sent! Check console for file paths.\n"
			);
		}

		// MessageBuilder API: Email with multiple attachments (text, JSON, simulated binary)
		if (url.pathname === "/send-multi-attachment") {
			const textAttachment = new TextEncoder().encode("Sample text file.");
			const jsonAttachment = new TextEncoder().encode(
				JSON.stringify({ message: "Hello from JSON!", timestamp: Date.now() })
			);
			// Simulate a small binary file (e.g., a tiny "PDF" with some binary data)
			const binaryAttachment = new Uint8Array([
				0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3,
				0xcf, 0xd3,
			]); // "%PDF-1.4" header

			await this.env.LIST_SEND.send({
				from: { name: "Charlie", email: "sender@penalosa.cloud" },
				to: "else@example.com",
				subject: "Email with Multiple Attachments",
				text: "This email has three different types of attachments.",
				html: "<h2>Multiple Attachments</h2><p>Check out the attached files!</p>",
				attachments: [
					{
						disposition: "attachment",
						filename: "document.txt",
						type: "text/plain",
						content: textAttachment,
					},
					{
						disposition: "attachment",
						filename: "data.json",
						type: "application/json",
						content: jsonAttachment,
					},
					{
						disposition: "attachment",
						filename: "sample.pdf",
						type: "application/pdf",
						content: binaryAttachment,
					},
				],
			} as any);
			return new Response(
				"✅ Email with multiple attachments sent! Check console for all file paths.\n"
			);
		}

		// MessageBuilder API: Complex email with multiple recipients (to/cc/bcc)
		if (url.pathname === "/send-complex") {
			await this.env.LIST_SEND.send({
				from: { name: "David", email: "sender@penalosa.cloud" },
				to: [
					{ name: "Recipient One", email: "else@example.com" },
					"something@example.com",
				],
				cc: { name: "CC Person", email: "else@example.com" },
				bcc: ["something@example.com"],
				subject: "Complex Email Test",
				text: "Plain text for email clients that don't support HTML.",
				html: `
<html>
<body>
	<h1>Complex Email</h1>
	<p>This demonstrates:</p>
	<ul>
		<li>Multiple TO recipients (with and without names)</li>
		<li>CC recipient with name</li>
		<li>BCC recipient</li>
		<li>Both text and HTML content</li>
	</ul>
</body>
</html>
				`.trim(),
			} as any);
			return new Response(
				"✅ Complex email sent! Check console for file paths.\n"
			);
		}

		// Test all three binding types
		if (url.pathname === "/test-bindings") {
			const results: string[] = [];

			// Test UNBOUND_SEND (no restrictions)
			try {
				await this.env.UNBOUND_SEND.send({
					from: "sender@penalosa.cloud",
					to: "anyone@anywhere.com",
					subject: "UNBOUND_SEND Test",
					text: "This uses the unbound binding.",
				} as any);
				results.push("✅ UNBOUND_SEND: Success");
			} catch (e) {
				results.push(`❌ UNBOUND_SEND: ${(e as Error).message}`);
			}

			// Test SPECIFIC_SEND (only to something@example.com)
			try {
				await this.env.SPECIFIC_SEND.send({
					from: "sender@penalosa.cloud",
					to: "something@example.com",
					subject: "SPECIFIC_SEND Test",
					text: "This uses the specific binding.",
				} as any);
				results.push("✅ SPECIFIC_SEND: Success");
			} catch (e) {
				results.push(`❌ SPECIFIC_SEND: ${(e as Error).message}`);
			}

			// Test LIST_SEND (allowed list)
			try {
				await this.env.LIST_SEND.send({
					from: "sender@penalosa.cloud",
					to: "else@example.com",
					subject: "LIST_SEND Test",
					text: "This uses the list binding.",
				} as any);
				results.push("✅ LIST_SEND: Success");
			} catch (e) {
				results.push(`❌ LIST_SEND: ${(e as Error).message}`);
			}

			return new Response(results.join("\n") + "\n");
		}

		return new Response(
			"Email Worker Fixture\n\n" +
				"Available routes:\n" +
				"  /send                   - EmailMessage API (raw MIME)\n" +
				"  /send-simple            - MessageBuilder: Simple text email\n" +
				"  /send-html              - MessageBuilder: Text + HTML\n" +
				"  /send-attachment        - MessageBuilder: With text attachment\n" +
				"  /send-multi-attachment  - MessageBuilder: Multiple attachments\n" +
				"  /send-complex           - MessageBuilder: Multiple recipients (to/cc/bcc)\n" +
				"  /test-bindings          - Test all three email binding types\n"
		);
	}
	async email(message: ForwardableEmailMessage) {
		console.log("hello");
		const msg = createMimeMessage();
		msg.setHeader("In-Reply-To", message.headers.get("Message-ID")!);
		msg.setSender(message.to);
		msg.setRecipient(message.from);
		msg.setSubject("An email generated in a Worker");
		msg.addMessage({
			contentType: "text/plain",
			data: `Congratulations, you just sent an email from a Worker.`,
		});

		const m = new EmailMessage(message.to, message.from, msg.asRaw());
		await message.forward(
			"samuel@macleod.space",
			new Headers({ hello: "world" })
		);
		await message.reply(m);
	}
}
