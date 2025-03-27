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
			msg.setRecipient("else@exmaple.com");
			msg.setSubject("An email generated in a Worker");
			msg.addMessage({
				contentType: "text/plain",
				data: "Congratulations, you just sent an email from a Worker.",
			});
			const m = new EmailMessage(
				"sender@penalosa.cloud",
				"else@exmaple.com",
				msg.asRaw()
			);
			await this.env.LIST_SEND.send(m);
		}

		return new Response("Hello World!");
	}
	async email(message: ForwardableEmailMessage) {
		const msg = createMimeMessage();
		msg.setHeader("In-Reply-To", message.headers.get("Message-ID")!);
		msg.setSender({ name: "Sender", addr: "sender@penalosa.cloud" });
		msg.setRecipient(message.from);
		msg.setSubject("An email generated in a Worker");
		msg.addMessage({
			contentType: "text/plain",
			data: `Congratulations, you just sent an email from a Worker.`,
		});

		const m = new EmailMessage(
			"sender@penalosa.cloud",
			message.from,
			msg.asRaw()
		);
		await message.forward(
			"samuel@macleod.space",
			new Headers({ hello: "world" })
		);
		message.setReject("Rejection reason");
		await message.reply(m);
	}

	async scheduled() {
		console.log("I'm scheduled!");
	}
}
