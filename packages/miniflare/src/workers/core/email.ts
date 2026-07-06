import assert from "node:assert";
import { $, blue, red, reset, yellow } from "kleur/colors";
import { LogLevel, SharedHeaders } from "miniflare:shared";
import PostalMime from "postal-mime";
import { RAW_EMAIL } from "../email/constants";
import { isEmailReplyable, validateReply } from "../email/validate";
import { CoreBindings } from "./constants";
import type { MiniflareEmailMessage } from "../email/email.worker";
import type {
	EmailAddress,
	EmailAttachment,
	EmailReplyMessageBuilder,
} from "../email/types";
import type {
	EmailMessage as WorkersEmailMessage,
	ForwardableEmailMessage,
} from "@cloudflare/workers-types/experimental";
import type { Email } from "postal-mime";

// Force-enable colours, because kleur can't detect this setting correctly from within a Worker
// The user setting should be respected (and ansi stripped out if needed) in https://github.com/cloudflare/workers-sdk/blob/2529848e9ff3ddb01ac8c73f96747f32b47aca3e/packages/miniflare/src/index.ts#L993
$.enabled = true;

type Env = {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
};

function renderEmailHeaders(headers: Headers | undefined) {
	return headers
		? `\n  headers:\n${[...headers.entries()].map(([k, v]) => `    ${k}: ${v}`).join("\n")}`
		: "";
}

function extractEmailAddress(addr: string | EmailAddress): string {
	if (typeof addr !== "string") {
		return addr.email;
	}

	const match = addr.match(/<([^>]+)>$/);
	return match ? match[1].trim() : addr.trim();
}

function formatEmailAddress(addr: string | EmailAddress): string {
	if (typeof addr === "string") {
		return addr;
	}

	return `"${addr.name}" <${addr.email}>`;
}

function formatContentId(contentId: string): string {
	return contentId.startsWith("<") && contentId.endsWith(">")
		? contentId
		: `<${contentId}>`;
}

function encodeBase64(content: string | ArrayBuffer | ArrayBufferView): string {
	let bytes: Uint8Array;
	if (typeof content === "string") {
		bytes = new TextEncoder().encode(content);
	} else if (content instanceof ArrayBuffer) {
		bytes = new Uint8Array(content);
	} else {
		bytes = new Uint8Array(
			content.buffer,
			content.byteOffset,
			content.byteLength
		);
	}

	let binary = "";
	for (let i = 0; i < bytes.byteLength; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}

	return btoa(binary)
		.replace(/.{1,76}/g, "$&\r\n")
		.trimEnd();
}

function renderAttachment(attachment: EmailAttachment): string {
	// Formats the mime parameter
	const filename = attachment.filename.replace(/["\\\r\n]/g, "_");
	const headers = [
		"Content-Transfer-Encoding: base64",
		`Content-Disposition: ${attachment.disposition}; filename="${filename}"`,
		`Content-Type: ${attachment.type}; name="${filename}"`,
	] satisfies string[];

	if (attachment.contentId !== undefined) {
		headers.push(`Content-ID: ${formatContentId(attachment.contentId)}`);
	}

	return `${headers.join("\r\n")}\r\n\r\n${encodeBase64(attachment.content)}`;
}

function renderEmailBody(
	body: string,
	contentType: string,
	attachments: EmailAttachment[] | undefined
): { body: string; contentType: string } {
	if (attachments === undefined || attachments.length === 0) {
		return {
			contentType: `${contentType}; charset=UTF-8`,
			body,
		};
	}

	const boundary = `----=_Part_${crypto.randomUUID().replaceAll("-", "")}`;
	const parts = [
		`Content-Type: ${contentType}; charset=UTF-8\r\n\r\n${body}`,
		...attachments.map(renderAttachment),
	] satisfies string[];

	return {
		contentType: `multipart/mixed; boundary="${boundary}"`,
		body: `${parts.map((part) => `--${boundary}\r\n${part}`).join("\r\n")}\r\n--${boundary}--`,
	};
}

function buildEmailMessage(
	messageOrBuilder: WorkersEmailMessage | EmailReplyMessageBuilder,
	parsedIncomingEmail: Email
): MiniflareEmailMessage | null {
	if (RAW_EMAIL in messageOrBuilder) {
		return messageOrBuilder as MiniflareEmailMessage;
	}

	if ("subject" in messageOrBuilder) {
		const recipient = parsedIncomingEmail.from.address;
		assert(recipient !== undefined, "Incoming email From address is undefined");

		const { body, contentType } = renderEmailBody(
			messageOrBuilder.html ?? messageOrBuilder.text ?? "",
			messageOrBuilder.html === undefined ? "text/plain" : "text/html",
			messageOrBuilder.attachments
		);
		const uuid = crypto.randomUUID().replaceAll("-", "");

		const incomingReferences = parsedIncomingEmail.references ?? "";
		const references = `${incomingReferences}${incomingReferences.length > 0 ? " " : ""}${parsedIncomingEmail.messageId}`;

		const headers = [
			`From: ${formatEmailAddress(messageOrBuilder.from)}`,
			`To: ${recipient}`,
			`Subject: ${messageOrBuilder.subject}`,
			`Message-ID: <${uuid}@example.com>`,
			`In-Reply-To: ${parsedIncomingEmail.messageId}`,
			`References: ${references}`,
			`MIME-Version: 1.0`,
			`Content-Type: ${contentType}`,
		] satisfies string[];

		if (messageOrBuilder.replyTo !== undefined) {
			headers.push(`Reply-To: ${formatEmailAddress(messageOrBuilder.replyTo)}`);
		}

		for (const [key, value] of Object.entries(messageOrBuilder.headers ?? {})) {
			headers.push(`${key}: ${value}`);
		}

		const raw = new Response(`${headers.join("\r\n")}\r\n\r\n${body}`).body;
		assert(raw !== null, "Reply message body is null");

		return {
			[RAW_EMAIL]: raw,
			from: extractEmailAddress(messageOrBuilder.from),
			to: recipient,
		};
	}

	return null;
}

export async function handleEmail(
	params: URLSearchParams,
	request: Request,
	service: Fetcher,
	env: Env,
	ctx: ExecutionContext
): Promise<Response> {
	// Turn an HTTP request into an EmailMessage, using:
	//  - `from` and `to` from the URL
	//    - These refer to the SMTP envelope addresses: https://datatracker.ietf.org/doc/html/rfc5321#section-3
	//  - `raw` from the request body
	//  - `headers` from the request headers
	// Refer to https://developers.cloudflare.com/email-routing/email-workers/runtime-api/#emailmessage-definition for more details
	const from = params.get("from");
	const to = params.get("to");

	if (!request.body || !from || !to) {
		return new Response(
			"Invalid email. Your request must include URL parameters specifying the `from` and `to` addresses, as well as an email in the body",
			{
				status: 400,
			}
		);
	}
	// We need to parse the email body in this handler in order to validate it, but we also want to pass through
	// the raw email to the user Worker. As such, clone the request for use in this handler.
	const clonedRequest = request.clone();

	assert(clonedRequest.body !== null, "Cloned request body is null");

	const incomingEmailRaw = new Uint8Array(await request.arrayBuffer());

	// Email Routing does not support messages bigger than 25Mib: https://developers.cloudflare.com/email-routing/limits/#message-size
	// In practice, local dev only supports 1MB, since it uses a JSRPC transport.
	if (incomingEmailRaw.byteLength > 25 * 1024 * 1024) {
		return new Response(
			"Email message size is bigger than the production size limit of 25MiB. Local development has a lower limit of 1Mib.",
			{
				status: 400,
			}
		);
	}
	if (incomingEmailRaw.byteLength > 1024 * 1024) {
		return new Response(
			"Email message size is within the production size limit of 25MiB, but exceeds the lower 1Mib limit for testing locally.",
			{
				status: 400,
			}
		);
	}

	let parsedIncomingEmail: Email;
	try {
		parsedIncomingEmail = await PostalMime.parse(incomingEmailRaw);
	} catch (e) {
		const error = e as Error;
		return new Response(
			`Email could not be parsed: ${error.name}: ${error.message}`,
			{ status: 400 }
		);
	}

	if (parsedIncomingEmail.messageId === undefined) {
		return new Response(
			"Email could not be parsed: invalid or no message id provided",
			{ status: 400 }
		);
	}

	// Emails can contain both an "envelope" from/to and a "header" from/to. Warn if these are different.
	// Refer to https://datatracker.ietf.org/doc/html/rfc5321#section-3, https://datatracker.ietf.org/doc/html/rfc5322#section-3.6.2, and https://datatracker.ietf.org/doc/html/rfc5322#section-3.6.3 for more details
	if (from !== parsedIncomingEmail.from.address) {
		await env[CoreBindings.SERVICE_LOOPBACK].fetch(
			"http://localhost/core/log",
			{
				method: "POST",
				headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.WARN.toString() },
				body: `${yellow("Provided MAIL FROM address doesn't match the email message's \"From\" header")}:\n  MAIL FROM: ${from}\n  "From" header: ${parsedIncomingEmail.from.address}`,
			}
		);
	}

	if (!parsedIncomingEmail.to?.map((addr) => addr.address).includes(to)) {
		await env[CoreBindings.SERVICE_LOOPBACK].fetch(
			"http://localhost/core/log",
			{
				method: "POST",
				headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.WARN.toString() },
				body: `${yellow('Provided RCPT TO address doesn\'t match any "To" header in the email message')}:\n  RCPT TO: ${to}\n  "To" header: ${parsedIncomingEmail.to?.map((addr) => addr.address).join(", ")}`,
			}
		);
	}

	const incomingEmailHeaders = new Headers(
		parsedIncomingEmail.headers.map((header) => [header.key, header.value])
	);

	// Propogate `.setReject()` reasons to the caller
	let maybeClientError: string | undefined = undefined;

	// @ts-expect-error .email is not in the `Fetcher` but it's a valid RPC call.
	await service.email(
		// Construct a ForwardableEmailMessage-like object. We need
		// - ForwardableEmailMessage to be able to be passed across JSRPC (to support e.g. userWorker.email(ForwardableEmailMessage))
		// - ForwardableEmailMessage properties to be synchronously available (to match production). This rules out a class extending `RpcStub`
		// However, unlike EmailMessage (see email.worker.ts) it doesn't need to be user-constructable, and so we can just use an object with `satisfies`
		{
			from,
			to,
			raw: clonedRequest.body,
			rawSize: incomingEmailRaw.byteLength,
			headers: incomingEmailHeaders,
			setReject: (reason: string): void => {
				ctx.waitUntil(
					env[CoreBindings.SERVICE_LOOPBACK].fetch(
						"http://localhost/core/log",
						{
							method: "POST",
							headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.ERROR.toString() },
							body: `${red("Email handler rejected message")}${reset(` with the following reason: "${reason}"`)}`,
						}
					)
				);
				maybeClientError = reason;
			},
			forward: async (
				rcptTo: string,
				headers?: Headers
			): Promise<EmailSendResult> => {
				await env[CoreBindings.SERVICE_LOOPBACK].fetch(
					"http://localhost/core/log",
					{
						method: "POST",
						headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.INFO.toString() },
						body: `${blue("Email handler forwarded message")}${reset(` with\n  rcptTo: ${rcptTo}${renderEmailHeaders(headers)}`)}`,
					}
				);
				/**
				 * The message ID in production is a 36 character random string that identifies the message for e.g. linking up threads.
				 * In production it uses the sender domain rather than example.com. Locally, we have access to none of that information
				 * so instead we make a dummy message ID that matches the production format (36 characters followed by a domain)
				 */
				const uuid = crypto.randomUUID().replaceAll("-", "");
				return { messageId: `${uuid}@example.com` };
			},
			reply: async (replyMessage) => {
				if (
					!(await isEmailReplyable(
						parsedIncomingEmail,
						incomingEmailHeaders,
						async (msg) =>
							void (await env[CoreBindings.SERVICE_LOOPBACK].fetch(
								"http://localhost/core/log",
								{
									method: "POST",
									headers: {
										[SharedHeaders.LOG_LEVEL]: LogLevel.ERROR.toString(),
									},
									body: msg,
								}
							))
					))
				) {
					throw new Error("Original email is not replyable");
				}

				const emailMessage = buildEmailMessage(
					replyMessage,
					parsedIncomingEmail
				);
				if (!emailMessage) {
					throw new Error("Unsupported email reply message");
				}

				const finalReply = await validateReply(
					parsedIncomingEmail,
					emailMessage
				);

				const resp = await env[CoreBindings.SERVICE_LOOPBACK].fetch(
					"http://localhost/core/store-temp-file?extension=eml&prefix=email",
					{
						method: "POST",
						body: finalReply,
					}
				);
				const file = await resp.text();

				await env[CoreBindings.SERVICE_LOOPBACK].fetch(
					"http://localhost/core/log",
					{
						method: "POST",
						headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.INFO.toString() },
						body: `${blue("Email handler replied to sender")}${reset(` with the following message:\n  ${file}`)}`,
					}
				);

				/**
				 * The message ID in production is a 36 character random string that identifies the message for e.g. linking up threads.
				 * In production it uses the sender domain rather than example.com. Locally, we have access to none of that information
				 * so instead we make a dummy message ID that matches the production format (36 characters followed by a domain)
				 */
				const uuid = crypto.randomUUID().replaceAll("-", "");
				return { messageId: `${uuid}@example.com` };
			},
		} satisfies ForwardableEmailMessage
	);

	if (maybeClientError !== undefined) {
		return new Response(
			`Worker rejected email with the following reason: ${maybeClientError}`,
			{ status: 400 }
		);
	}

	return new Response("Worker successfully processed email", {
		status: 200,
	});
}
