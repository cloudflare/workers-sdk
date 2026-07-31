import assert from "node:assert";
import { $, blue, red, reset, yellow } from "kleur/colors";
import { LogLevel, SharedHeaders } from "miniflare:shared";
import PostalMime from "postal-mime";
import { messageIdToStorageId, synthesizeMessageId } from "../email/message-id";
import { isEmailReplyable, validateReply } from "../email/validate";
import { CoreBindings } from "./constants";
import type { MiniflareEmailMessage } from "../email/email.worker";
import type {
	EmailHandlerEvent,
	EmailHandlerForward,
	EmailHandlerReply,
} from "../email/result";
import type { EmailStoreService, StoredRoutingEmail } from "../email/storage";
import type { ForwardableEmailMessage } from "@cloudflare/workers-types/experimental";
import type { Email } from "postal-mime";

// Force-enable colours, because kleur can't detect this setting correctly from within a Worker
// The user setting should be respected (and ansi stripped out if needed) in https://github.com/cloudflare/workers-sdk/blob/2529848e9ff3ddb01ac8c73f96747f32b47aca3e/packages/miniflare/src/index.ts#L993
$.enabled = true;

type Env = {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
	[CoreBindings.SERVICE_EMAIL_STORE]?: EmailStoreService;
};

function renderEmailHeaders(headers: Headers | undefined) {
	return headers
		? `\n  headers:\n${[...headers.entries()].map(([k, v]) => `    ${k}: ${v}`).join("\n")}`
		: "";
}

function isMissingEmailHandlerError(e: unknown): boolean {
	return (
		e instanceof Error &&
		e.message.includes('does not implement the method "email"')
	);
}

export async function handleEmail(
	params: URLSearchParams,
	request: Request,
	service: Fetcher,
	env: Env,
	ctx: ExecutionContext
): Promise<Response> {
	const events: EmailHandlerEvent[] = [];
	const forwards: EmailHandlerForward[] = [];
	const replies: EmailHandlerReply[] = [];

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

	// The result of dispatching this message, shared between the JSON response
	// and the local explorer store. `events` is seeded with `received` and grows
	// as the handler forwards/replies/rejects; `outcome` is finalised below.
	let outcome: "ok" | "exception" = "ok";
	// Propogate `.setReject()` reasons to the caller
	let rejectReason: string | undefined = undefined;
	events.push({ type: "received", timestamp: new Date().toISOString() });

	// Capture this email for the local explorer "Routing" interface. The store
	// indexes records by their Message-ID; `emailId` is used only to name any
	// files written to disk so they can be matched to this message.
	// TODO(miniflare v5): switch on-disk file naming to a mimetext-style id (or a
	// `crypto.randomUUID()`), decoupling the file name from the Message-ID.
	const emailId =
		params.get("id") ?? messageIdToStorageId(parsedIncomingEmail.messageId);
	const storedEmail: StoredRoutingEmail = {
		worker: params.get("worker") ?? undefined,
		from,
		to,
		subject: parsedIncomingEmail.subject ?? "(no subject)",
		messageId: parsedIncomingEmail.messageId,
		receivedAt: new Date().toISOString(),
		rawSize: incomingEmailRaw.byteLength,
		raw: new TextDecoder().decode(incomingEmailRaw),
		attachments: (parsedIncomingEmail.attachments ?? []).map((attachment) => ({
			filename: attachment.filename ?? "attachment",
			contentType: attachment.mimeType ?? "application/octet-stream",
			disposition:
				attachment.disposition === "inline" ? "inline" : "attachment",
			size:
				typeof attachment.content === "string"
					? attachment.content.length
					: attachment.content.byteLength,
		})),
		outcome,
		forwards,
		replies,
		events,
	};
	// Store exactly once per request, no matter which exit path runs. The result
	// fields are refreshed from the (possibly mutated) locals on each attempt.
	let stored = false;
	async function storeReceivedEmail(): Promise<void> {
		if (stored) {
			return;
		}
		stored = true;
		storedEmail.outcome = outcome;
		storedEmail.rejectReason = rejectReason;
		try {
			await env[CoreBindings.SERVICE_EMAIL_STORE]?.storeReceived(storedEmail);
		} catch {
			// Ignore storage failures - they must not affect email handling.
			stored = false;
		}
	}

	try {
		// @ts-expect-error .email is not in the `Fetcher` but it's a valid RPC call.
		const emailEvent = service.email(
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
								headers: {
									[SharedHeaders.LOG_LEVEL]: LogLevel.ERROR.toString(),
								},
								body: `${red("Email handler rejected message")}${reset(` with the following reason: "${reason}"`)}`,
							}
						)
					);

					events.push({
						type: "reject",
						timestamp: new Date().toISOString(),
					});
					rejectReason = reason;
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
					// Production returns a message id identifying the forwarded message.
					// Locally we have no such id, so synthesize one in the production
					// shape, using the recipient's domain.
					const result = { messageId: synthesizeMessageId(rcptTo) };

					events.push({
						type: "forward",
						timestamp: new Date().toISOString(),
						messageId: result.messageId,
					});
					forwards.push({
						recipient: rcptTo,
						headers: headers ? [...headers.entries()] : [],
						messageId: result.messageId,
					});

					return result;
				},
				reply: async (replyMessage): Promise<EmailSendResult> => {
					assert(
						"from" in replyMessage && "to" in replyMessage,
						"EmailReplyMessageBuilder is not currently supported"
					);

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
					const finalReply = await validateReply(
						parsedIncomingEmail,
						replyMessage as MiniflareEmailMessage
					);

					// Store the reply under `email/<session-id>/reply/<emailId>.eml` -
					// grouped under `reply/` (keeping it separate from sent emails)
					const resp = await env[CoreBindings.SERVICE_LOOPBACK].fetch(
						`http://localhost/core/store-temp-file?email=true&extension=eml&prefix=reply&id=${encodeURIComponent(emailId)}`,
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

					// Production returns a message id identifying the reply, used for
					// e.g. linking up threads. Locally we have no such id, so synthesize
					// one in the production shape, using the reply sender's domain.
					const result = { messageId: synthesizeMessageId(replyMessage.from) };
					events.push({
						type: "reply",
						timestamp: new Date().toISOString(),
						messageId: result.messageId,
					});
					replies.push({
						messageId: result.messageId,
						sender: replyMessage.from,
						raw: new TextDecoder().decode(finalReply),
					});
					return result;
				},
			} satisfies ForwardableEmailMessage
		);

		if (params.get("format") !== "json") {
			await emailEvent;
			// Record the message now the handler has finished, so `events` is
			// complete. Every exit from here on must store exactly once.
			await storeReceivedEmail();

			if (rejectReason !== undefined) {
				return new Response(
					`Worker rejected email with the following reason: ${rejectReason}`,
					{ status: 400 }
				);
			}

			return new Response("Worker successfully processed email", {
				status: 200,
			});
		}

		try {
			await emailEvent;
			outcome = "ok";
		} catch (e) {
			outcome = "exception";
			if (isMissingEmailHandlerError(e)) {
				// The Worker has no `email()` handler, so the message could not be
				// delivered. Record it as `unhandled` (replacing the `received` seed)
				// so the local explorer can mark it accordingly.
				events.splice(0, events.length, {
					type: "unhandled",
					timestamp: new Date().toISOString(),
				});
			}
		}

		// Give an un-awaited `setReject()` call time to cross JSRPC.
		await scheduler.wait(0);
		await storeReceivedEmail();

		return Response.json(
			{
				outcome,
				rejectReason,
				forwards,
				replies,
				events,
			},
			{ status: outcome === "ok" ? 200 : 500 }
		);
	} catch (e) {
		outcome = "exception";
		if (isMissingEmailHandlerError(e)) {
			// The Worker has no `email()` handler, so the message could not be
			// delivered. It should be recorded and marked as `unhandled` in the
			// local explorer.
			events.splice(0, events.length, {
				type: "unhandled",
				timestamp: new Date().toISOString(),
			});
			await storeReceivedEmail();
			return new Response(
				"Worker does not export an email() handler; message stored without delivery.",
				{ status: 200 }
			);
		}
		await storeReceivedEmail();
		throw e;
	}
}
