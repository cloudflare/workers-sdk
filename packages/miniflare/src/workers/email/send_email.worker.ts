import { WorkerEntrypoint } from "cloudflare:workers";
import { blue } from "kleur/colors";
import PostalMime, { Email } from "postal-mime";
import { CoreBindings } from "../core/constants";
import { RAW_EMAIL } from "./constants";
import { type MiniflareEmailMessage as EmailMessage } from "./email.worker";

interface SendEmailEnv {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
	destination_address?: string;
	allowed_destination_addresses?: string[];
}

export class SendEmailBinding extends WorkerEntrypoint<SendEmailEnv> {
	constructor(ctx: ExecutionContext, env: SendEmailEnv) {
		super(ctx, env);
	}

	async send(emailMessage: EmailMessage): Promise<void> {
		if (
			this.env.destination_address !== undefined &&
			emailMessage.to !== this.env.destination_address
		) {
			throw new Error(`email to ${emailMessage.to} not allowed`);
		}

		if (
			this.env.allowed_destination_addresses !== undefined &&
			!this.env.allowed_destination_addresses.includes(emailMessage.to)
		) {
			throw new Error(`email to ${emailMessage.to} not allowed`);
		}

		const rawEmail: ReadableStream<Uint8Array> = emailMessage[RAW_EMAIL];

		const rawEmailBuffer = new Uint8Array(
			await new Response(rawEmail).arrayBuffer()
		);

		let parsedEmail: Email;

		try {
			parsedEmail = await PostalMime.parse(rawEmailBuffer);
		} catch (e) {
			const error = e as Error;
			throw new Error(`could not parse email: ${error.message}`);
		}

		if (parsedEmail.messageId === undefined) {
			throw new Error("invalid message-id");
		}

		let emailHeaders: Headers;
		try {
			emailHeaders = new Headers(
				parsedEmail.headers.map((header) => [header.key, header.value])
			);
		} catch (e) {
			const error = e as Error;
			throw new Error(`could not parse email: ${error.message}`);
		}

		if (emailMessage.from !== parsedEmail.from.address) {
			throw new Error("From: header does not match mail from");
		}

		if (emailHeaders.get("received") !== null) {
			throw new Error("invalid headers set");
		}

		const resp = await this.env[CoreBindings.SERVICE_LOOPBACK].fetch(
			"http://localhost/core/store-temp-file?extension=eml",
			{
				method: "POST",
				body: rawEmailBuffer,
			}
		);
		const file = await resp.text();

		console.log(
			`${blue("send_email binding called with the following message:")}\n  ${file}`
		);
	}
}
