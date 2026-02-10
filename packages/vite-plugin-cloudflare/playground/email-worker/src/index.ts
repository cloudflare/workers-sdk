import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";
import * as PostalMime from "postal-mime";

interface Env {
	EMAIL: SendEmail;
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (url.pathname === "/send") {
			const msg = createMimeMessage();
			msg.setSender({ name: "Sending email test", addr: "sender@example.com" });
			msg.setRecipient("recipient@example.com");
			msg.setSubject("An email generated in a Worker");
			msg.addMessage({
				contentType: "text/plain",
				data: `Congratulations, you just sent an email from a Worker.`,
			});
			const message = new EmailMessage(
				"sender@example.com",
				"recipient@example.com",
				msg.asRaw()
			);

			await env.EMAIL.send(message);

			return new Response("Email message sent successfully!");
		}

		return new Response("Hello Email Workers playground!");
	},
	async email(message: ForwardableEmailMessage) {
		const parser = new PostalMime.default();
		const rawEmail = new Response(message.raw);
		const email = await parser.parse(await rawEmail.arrayBuffer());
		console.log(
			`Received email from ${email.from.address} on ${email.date} with following message:\n\n ${email.html}`
		);
	},
} satisfies ExportedHandler<Env>;
