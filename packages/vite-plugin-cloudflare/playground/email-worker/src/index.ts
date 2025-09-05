import { EmailMessage } from "cloudflare:email";
import { WorkerEntrypoint } from "cloudflare:workers";
import { createMimeMessage } from "mimetext";
import * as PostalMime from "postal-mime";
import type { SendEmail } from "@cloudflare/workers-types";

interface Env {
	EMAIL: SendEmail;
}

export default class extends WorkerEntrypoint<Env> {
	override async fetch(request: Request): Promise<Response> {
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

			try {
				await this.env.EMAIL.send(message);
			} catch (error) {
				throw error;
			}

			return new Response("Email message sent successfully!");
		}

		return new Response("Hello Email Workers playground!");
	}

	async email(message: ForwardableEmailMessage) {
		const parser = new PostalMime.default();
		const rawEmail = new Response(message.raw);
		const email = await parser.parse(await rawEmail.arrayBuffer());
		console.log(
			`Received email from ${email.from.address} on ${email.date} with following message:\n\n ${email.html}`
		);
	}
}
