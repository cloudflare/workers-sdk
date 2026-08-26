import assert from "node:assert";
import { $, blue, red, reset, yellow } from "kleur/colors";
import { LogLevel } from "miniflare:shared";
import PostalMime from "postal-mime";
import {
	captureRawForBodyRow,
	MAX_PRODUCTION_EMAIL_BYTES,
	RAW_EMAIL,
	stripEmailHeader,
} from "../email/capture";
import { getParsedEmailCaptureFields } from "../email/capture-metadata";
import { logEmailToLoopback, storeEmailTempFile } from "../email/loopback";
import { messageIdToStorageId, synthesizeMessageId } from "../email/message-id";
import { buildReplyFromMessageBuilder } from "../email/mime";
import { isEmailReplyable, validateReply } from "../email/validate";
import { CoreBindings } from "./constants";
import type { MiniflareEmailMessage } from "../email/email.worker";
import type {
	EmailHandlerEvent,
	EmailHandlerForward,
	EmailHandlerReply,
	EmailStoreService,
	StoredRoutingEmailMetadata,
} from "../email/storage";
import type { EmailReplyMessageBuilder } from "../email/types";
import type { ForwardableEmailMessage } from "@cloudflare/workers-types/experimental";
import type { Email } from "postal-mime";

// Force-enable colours, because kleur can't detect this setting correctly from within a Worker
// The user setting should be respected (and ansi stripped out if needed) in https://github.com/cloudflare/workers-sdk/blob/2529848e9ff3ddb01ac8c73f96747f32b47aca3e/packages/miniflare/src/index.ts#L993
$.enabled = true;

type Env = {
	[CoreBindings.SERVICE_LOOPBACK]: Fetcher;
	[CoreBindings.SERVICE_EMAIL_STORE]: EmailStoreService;
};

function renderEmailHeaders(headers: Headers | undefined) {
	return headers
		? `\n  headers:\n${[...headers.entries()].map(([k, v]) => `    ${escapeLogValue(k)}: ${escapeLogValue(v)}`).join("\n")}`
		: "";
}

function escapeLogValue(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f]/gu, (character) => {
		const code = character.codePointAt(0) ?? 0;
		return `\\x${code.toString(16).padStart(2, "0")}`;
	});
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
	workerName: string,
	env: Env,
	ctx: ExecutionContext
): Promise<Response> {
	const events: EmailHandlerEvent[] = [];
	const forwards: EmailHandlerForward[] = [];
	const replies: EmailHandlerReply[] = [];
	const capturedReplyRawBase64: string[] = [];
	const capturedReplyTruncated: boolean[] = [];

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
	const incomingEmailRaw = new Uint8Array(await request.arrayBuffer());

	// Reject messages larger than production limit of 25MiB
	if (incomingEmailRaw.byteLength > MAX_PRODUCTION_EMAIL_BYTES) {
		return new Response(
			"Email message size is bigger than the production size limit of 25 MiB.",
			{ status: 400 }
		);
	}

	// SMTP removes Bcc before a recipient receives a message. Local injection can
	// include it in the raw request, so derive the recipient-visible copy once and
	// use it consistently for parsing, delivery, and capture.
	const deliveredEmailRaw = stripEmailHeader(incomingEmailRaw, "bcc");

	let parsedIncomingEmail: Email;
	try {
		parsedIncomingEmail = await PostalMime.parse(deliveredEmailRaw);
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
		await logEmailToLoopback(
			env[CoreBindings.SERVICE_LOOPBACK],
			`${yellow("Provided MAIL FROM address doesn't match the email message's \"From\" header")}:\n  MAIL FROM: ${escapeLogValue(from)}\n  "From" header: ${escapeLogValue(parsedIncomingEmail.from.address ?? "")}`,
			LogLevel.WARN
		);
	}

	if (!parsedIncomingEmail.to?.map((addr) => addr.address).includes(to)) {
		await logEmailToLoopback(
			env[CoreBindings.SERVICE_LOOPBACK],
			`${yellow('Provided RCPT TO address doesn\'t match any "To" header in the email message')}:\n  RCPT TO: ${escapeLogValue(to)}\n  "To" header: ${escapeLogValue(parsedIncomingEmail.to?.map((addr) => addr.address).join(", ") ?? "")}`,
			LogLevel.WARN
		);
	}

	const incomingEmailHeaders = new Headers(
		parsedIncomingEmail.headers
			.filter(({ key }) => key.toLowerCase() !== "bcc")
			.map((header) => [header.key, header.value])
	);

	let outcome: "ok" | "exception" = "ok";
	// Propagate `.setReject()` reasons to the caller
	let rejectReason: string | undefined = undefined;
	function structuredResultResponse(): Response {
		return Response.json(
			{
				outcome,
				rejectReason,
				forwards,
				replies: replies.map(({ rawBase64: _rawBase64, ...reply }) => reply),
				events,
			},
			{ status: outcome === "ok" ? 200 : 500 }
		);
	}
	events.push({ type: "received", timestamp: new Date().toISOString() });

	const store = env[CoreBindings.SERVICE_EMAIL_STORE];
	const storedFrom = from;
	const storedTo = to;
	const receivedAt = new Date().toISOString();
	// Store exactly once per request, no matter which exit path runs. The result
	// fields are refreshed from the (possibly mutated) locals on each attempt.
	let stored = false;
	async function storeReceivedEmail(): Promise<void> {
		if (stored) {
			return;
		}
		stored = true;
		try {
			const capturedRaw = captureRawForBodyRow(deliveredEmailRaw);
			const rawBase64 = capturedRaw.rawBase64;
			const parsedFields = getParsedEmailCaptureFields(parsedIncomingEmail, [
				"bcc",
			]);
			const metadata: StoredRoutingEmailMetadata = {
				worker: workerName,
				from: storedFrom,
				to: storedTo,
				cc: parsedFields.cc,
				subject: parsedFields.subject,
				messageId: parsedIncomingEmail.messageId,
				headers: parsedFields.headers,
				receivedAt,
				rawSize: deliveredEmailRaw.byteLength,
				attachments: parsedFields.attachments,
				outcome,
				rejectReason,
				forwards,
				replies: replies.map(
					({ raw: _raw, rawBase64: _rawBase64, ...reply }, index) => ({
						...reply,
						...(capturedReplyTruncated[index]
							? { captureTruncated: true }
							: {}),
					})
				),
				events,
				...(capturedRaw.truncated ? { captureTruncated: true } : {}),
			};
			const captureId = crypto.randomUUID();
			try {
				await store.storeReceivedBody(captureId, 0, rawBase64);
				for (const [index] of replies.entries()) {
					const replyRawBase64 = capturedReplyRawBase64[index];
					if (replyRawBase64 === undefined) {
						throw new Error(
							`Received email ${metadata.messageId} has no captured reply body at index ${index}`
						);
					}
					await store.storeReceivedBody(captureId, index + 1, replyRawBase64);
				}
				await store.storeReceivedMetadata(
					captureId,
					replies.length + 1,
					metadata
				);
			} catch (error) {
				await store.discardReceived(captureId).catch(() => undefined);
				throw error;
			}
		} catch (error) {
			stored = false;
			try {
				await logEmailToLoopback(
					env[CoreBindings.SERVICE_LOOPBACK],
					`Failed to capture received email for the Local Explorer; the email was still delivered. Cause: ${escapeLogValue(error instanceof Error ? error.message : String(error))}`,
					LogLevel.WARN
				);
			} catch {
				// Logging failures must not affect email handling.
			}
		}
	}

	try {
		const deliveredEmailBody = new Response(deliveredEmailRaw).body;
		assert(deliveredEmailBody !== null, "Delivered email body is null");
		// @ts-expect-error .email is not in the `Fetcher` but it's a valid RPC call.
		const emailEvent = service.email(
			// Construct a ForwardableEmailMessage-like object. We need
			// - ForwardableEmailMessage to be able to be passed across JSRPC (to support e.g. userWorker.email(ForwardableEmailMessage))
			// - ForwardableEmailMessage properties to be synchronously available (to match production). This rules out a class extending `RpcStub`
			// However, unlike EmailMessage (see email.worker.ts) it doesn't need to be user-constructable, and so we can just use an object with `satisfies`
			{
				from,
				to,
				raw: deliveredEmailBody,
				rawSize: deliveredEmailRaw.byteLength,
				headers: incomingEmailHeaders,
				setReject: (reason: string): void => {
					ctx.waitUntil(
						logEmailToLoopback(
							env[CoreBindings.SERVICE_LOOPBACK],
							`${red("Email handler rejected message")}${reset(` with the following reason: "${escapeLogValue(reason)}"`)}`,
							LogLevel.ERROR
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
					await logEmailToLoopback(
						env[CoreBindings.SERVICE_LOOPBACK],
						`${blue("Email handler forwarded message")}${reset(` with\n  rcptTo: ${escapeLogValue(rcptTo)}${renderEmailHeaders(headers)}`)}`
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
					if (
						!(await isEmailReplyable(
							parsedIncomingEmail,
							incomingEmailHeaders,
							async (msg) =>
								void (await logEmailToLoopback(
									env[CoreBindings.SERVICE_LOOPBACK],
									msg,
									LogLevel.ERROR
								))
						))
					) {
						throw new Error("Original email is not replyable");
					}
					let validatedReply: { raw: Uint8Array; messageId: string };
					let replySender: string;
					if (RAW_EMAIL in replyMessage) {
						const rawReply = replyMessage as MiniflareEmailMessage;
						validatedReply = await validateReply(parsedIncomingEmail, rawReply);
						replySender = rawReply.from;
					} else {
						const builtReply = buildReplyFromMessageBuilder(
							replyMessage as EmailReplyMessageBuilder,
							parsedIncomingEmail,
							from
						);
						validatedReply = builtReply;
						replySender = builtReply.sender;
					}
					const finalReply = validatedReply.raw;
					const replyId = messageIdToStorageId(validatedReply.messageId);

					// Store the reply under `email/<session-id>/reply/<replyId>.eml`.
					// The on-disk copy is a dev-only inspection aid, so a failure here
					// must not surface as an exception in the user's `email()` handler.
					// The reply itself has already succeeded; continue without a file path.
					let file: string | undefined;
					const resp = await storeEmailTempFile(
						env[CoreBindings.SERVICE_LOOPBACK],
						finalReply,
						{
							extension: "eml",
							prefix: "email/reply",
							id: replyId,
						}
					);
					if (resp.ok) {
						file = await resp.text();
					} else {
						await logEmailToLoopback(
							env[CoreBindings.SERVICE_LOOPBACK],
							`${yellow("Failed to persist replied email for the Local Explorer; the reply was still sent")}${reset(`: ${escapeLogValue(await resp.text())}`)}`,
							LogLevel.WARN
						);
					}

					await logEmailToLoopback(
						env[CoreBindings.SERVICE_LOOPBACK],
						`${blue("Email handler replied to sender")}${reset(` with the following message:\n  ${escapeLogValue(file ?? "(reply not persisted)")}`)}`
					);

					// The reply MIME already has a message id
					const result = { messageId: validatedReply.messageId };
					events.push({
						type: "reply",
						timestamp: new Date().toISOString(),
						messageId: result.messageId,
					});
					const capturedReply = captureRawForBodyRow(finalReply);
					capturedReplyRawBase64.push(capturedReply.rawBase64);
					capturedReplyTruncated.push(capturedReply.truncated);
					replies.push({
						messageId: result.messageId,
						sender: replySender,
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

			// Give an un-awaited `setReject()` call time to cross JSRPC.
			await scheduler.wait(0);
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
				events.splice(0, events.length, {
					type: "unhandled",
					timestamp: new Date().toISOString(),
				});
			} else {
				await logEmailToLoopback(
					env[CoreBindings.SERVICE_LOOPBACK],
					red(e instanceof Error ? (e.stack ?? String(e)) : String(e)),
					LogLevel.ERROR
				).catch(() => {
					// Logging failures must not affect delivery reporting.
				});
			}
		}

		// Give an un-awaited `setReject()` call time to cross JSRPC.
		await scheduler.wait(0);
		await storeReceivedEmail();

		return structuredResultResponse();
	} catch (e) {
		outcome = "exception";
		if (isMissingEmailHandlerError(e)) {
			events.splice(0, events.length, {
				type: "unhandled",
				timestamp: new Date().toISOString(),
			});
			await storeReceivedEmail();
			if (params.get("format") === "json") {
				return structuredResultResponse();
			}
			return new Response(
				"Worker does not export an email() handler; message stored without delivery.",
				{ status: 500 }
			);
		}
		await storeReceivedEmail();
		throw e;
	}
}
