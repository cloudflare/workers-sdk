import { EmailMessage } from "cloudflare:email";
import { env, WorkerEntrypoint } from "cloudflare:workers";
import { createMimeMessage } from "mimetext";

export default class extends WorkerEntrypoint<Env> {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/error") throw new Error("Hello Error");

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
		}

		return new Response("Hello World!");
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
