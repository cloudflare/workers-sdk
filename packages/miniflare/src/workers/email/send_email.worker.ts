import { WorkerEntrypoint } from "cloudflare:workers";
import { blue } from "kleur/colors";
import { LogLevel, SharedHeaders } from "miniflare:shared";
import PostalMime, { Email } from "postal-mime";
import { CoreBindings } from "../core/constants";
import { RAW_EMAIL } from "./constants";
import { type MiniflareEmailMessage as EmailMessage } from "./email.worker";

interface SendEmailEnv {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
	destination_address: string | undefined;
	allowed_destination_addresses: string[] | undefined;
	allowed_sender_addresses: string[] | undefined;
}

export class SendEmailBinding extends WorkerEntrypoint<SendEmailEnv> {
	private checkDestinationAllowed(to: string) {
		if (
			this.env.destination_address !== undefined &&
			to !== this.env.destination_address
		) {
			throw new Error(`email to ${to} not allowed`);
		}

		if (
			this.env.allowed_destination_addresses !== undefined &&
			!this.env.allowed_destination_addresses.includes(to)
		) {
			throw new Error(`email to ${to} not allowed`);
		}
	}
	private checkSenderAllowed(from: string) {
		if (
			this.env.allowed_sender_addresses !== undefined &&
			!this.env.allowed_sender_addresses.includes(from)
		) {
			throw new Error(`email from ${from} not allowed`);
		}
	}
	async send(emailMessage: EmailMessage): Promise<void> {
		this.checkDestinationAllowed(emailMessage.to);
		this.checkSenderAllowed(emailMessage.from);

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
			"http://localhost/core/store-temp-file?extension=eml&prefix=email",
			{
				method: "POST",
				body: rawEmailBuffer,
			}
		);
		const file = await resp.text();

		this.ctx.waitUntil(
			this.env[CoreBindings.SERVICE_LOOPBACK].fetch(
				"http://localhost/core/log",
				{
					method: "POST",
					headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.INFO.toString() },
					body: `${blue("send_email binding called with the following message:")}\n  ${file}`,
				}
			)
		);
	}
}
