import assert from "node:assert";
import { $, blue, red, reset, yellow } from "kleur/colors";
import { LogLevel, SharedHeaders } from "miniflare:shared";
import PostalMime from "postal-mime";
import { MAX_LOCAL_EMAIL_BYTES, truncateRawForCapture } from "../email/capture";
import { messageIdToStorageId, synthesizeMessageId } from "../email/message-id";
import { isEmailReplyable, validateReply } from "../email/validate";
import { CoreBindings } from "./constants";
import type { MiniflareEmailMessage } from "../email/email.worker";
import type {
	EmailArtifact,
	EmailHandlerEvent,
	EmailHandlerForward,
	EmailHandlerReply,
	EmailStoreService,
	StoredRoutingEmail,
	StoredRoutingEmailMetadata,
	StoredRoutingEmailRecord,
} from "../email/storage";
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

async function removeEmailArtifacts(
	loopback: Fetcher,
	artifacts: EmailArtifact[]
): Promise<void> {
	if (artifacts.length === 0) return;
	const response = await loopback.fetch(
		"http://localhost/core/delete-email-temp-files",
		{
			method: "POST",
			body: JSON.stringify({ artifacts }),
		}
	);
	if (!response.ok) {
		throw new Error(
			`could not delete email temporary files: ${await response.text()}`
		);
	}
}

export async function handleEmail(
	params: URLSearchParams,
	request: Request,
	service: Fetcher,
	workerName: string | undefined,
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

	// Delivery to the user Worker uses the full message regardless of size — the
	// capture feature must never change what `email()` receives. The captured
	// copy is truncated to `MAX_LOCAL_EMAIL_BYTES` (see `storeReceivedEmail`) so
	// the workerd-internal RPC to the store stays under its ~1 MiB argument cap.

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
				body: `${yellow("Provided MAIL FROM address doesn't match the email message's \"From\" header")}:\n  MAIL FROM: ${escapeLogValue(from)}\n  "From" header: ${escapeLogValue(parsedIncomingEmail.from.address ?? "")}`,
			}
		);
	}

	if (!parsedIncomingEmail.to?.map((addr) => addr.address).includes(to)) {
		await env[CoreBindings.SERVICE_LOOPBACK].fetch(
			"http://localhost/core/log",
			{
				method: "POST",
				headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.WARN.toString() },
				body: `${yellow('Provided RCPT TO address doesn\'t match any "To" header in the email message')}:\n  RCPT TO: ${escapeLogValue(to)}\n  "To" header: ${escapeLogValue(parsedIncomingEmail.to?.map((addr) => addr.address).join(", ") ?? "")}`,
			}
		);
	}

	const incomingEmailHeaders = new Headers(
		parsedIncomingEmail.headers.map((header) => [header.key, header.value])
	);

	let outcome: "ok" | "exception" = "ok";
	// Propogate `.setReject()` reasons to the caller
	let rejectReason: string | undefined = undefined;
	events.push({ type: "received", timestamp: new Date().toISOString() });

	// Capture this email for the local explorer "Routing" interface. Only the
	// first `MAX_LOCAL_EMAIL_BYTES` are captured (the full message is still
	// delivered to the user Worker); larger bodies are truncated so the store
	// RPC stays under its argument cap. `rawSize` keeps the original size.
	const capturedRaw = truncateRawForCapture(incomingEmailRaw);
	const rawBase64 = capturedRaw.rawBase64;
	if (capturedRaw.truncated) {
		ctx.waitUntil(
			env[CoreBindings.SERVICE_LOOPBACK]
				.fetch("http://localhost/core/log", {
					method: "POST",
					headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.WARN.toString() },
					body: `Received email exceeds the ${MAX_LOCAL_EMAIL_BYTES}-byte local capture limit; the email was delivered, but only the first ${MAX_LOCAL_EMAIL_BYTES} bytes are shown in the Local Explorer.`,
				})
				.catch(() => undefined)
		);
	}
	const storedEmail: StoredRoutingEmail = {
		worker: workerName,
		from,
		to,
		subject: parsedIncomingEmail.subject ?? "(no subject)",
		messageId: parsedIncomingEmail.messageId,
		receivedAt: new Date().toISOString(),
		rawSize: incomingEmailRaw.byteLength,
		raw: capturedRaw.raw,
		rawBase64,
		attachments: (parsedIncomingEmail.attachments ?? []).map((attachment) => ({
			filename: attachment.filename ?? "attachment",
			contentType: attachment.mimeType ?? "application/octet-stream",
			disposition:
				attachment.disposition === "inline" ? "inline" : "attachment",
			size:
				typeof attachment.content === "string"
					? new TextEncoder().encode(attachment.content).byteLength
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
			const {
				raw: _raw,
				rawBase64: _rawBase64,
				...emailMetadata
			} = storedEmail;
			const store = env[CoreBindings.SERVICE_EMAIL_STORE];
			let artifacts: EmailArtifact[] | undefined;
			if (store !== undefined) {
				const recordId = messageIdToStorageId(storedEmail.messageId);
				// Stream when either the received body or any reply body would
				// exceed workerd's RPC argument limit if sent in a single call.
				const needsStreaming =
					rawBase64.length > 64 * 1024 ||
					emailMetadata.replies.some(
						(reply) => (reply.rawBase64?.length ?? 0) > 64 * 1024
					);
				if (needsStreaming) {
					// Reply bodies are streamed separately, so drop them from the
					// prelude to keep it under the RPC argument limit.
					const metadata: StoredRoutingEmailMetadata = {
						...emailMetadata,
						replies: emailMetadata.replies.map(
							({ raw: _replyRaw, rawBase64: _replyRawBase64, ...reply }) =>
								reply
						),
					};
					await store.beginReceived(metadata);
					try {
						for (
							let offset = 0;
							offset < rawBase64.length;
							offset += 64 * 1024
						) {
							await store.appendReceivedRaw(
								recordId,
								rawBase64.slice(offset, offset + 64 * 1024)
							);
						}
						for (const [replyIndex, reply] of emailMetadata.replies.entries()) {
							const replyRawBase64 = reply.rawBase64;
							if (replyRawBase64 === undefined) {
								continue;
							}
							for (
								let offset = 0;
								offset < replyRawBase64.length;
								offset += 64 * 1024
							) {
								await store.appendReplyRaw(
									recordId,
									replyIndex,
									replyRawBase64.slice(offset, offset + 64 * 1024)
								);
							}
						}
						artifacts = await store.finishReceived(recordId);
					} catch (error) {
						await store.discardReceived(recordId).catch(() => undefined);
						throw error;
					}
				} else {
					const record: StoredRoutingEmailRecord = {
						...emailMetadata,
						rawBase64,
					};
					artifacts = await store.storeReceived(record);
				}
			}
			if (artifacts !== undefined) {
				try {
					await removeEmailArtifacts(
						env[CoreBindings.SERVICE_LOOPBACK],
						artifacts
					);
				} catch {
					ctx.waitUntil(
						env[CoreBindings.SERVICE_LOOPBACK]
							.fetch("http://localhost/core/log", {
								method: "POST",
								headers: {
									[SharedHeaders.LOG_LEVEL]: LogLevel.WARN.toString(),
								},
								body: "Failed to clean up evicted email artifacts.",
							})
							.catch(() => undefined)
					);
				}
			}
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
								body: `${red("Email handler rejected message")}${reset(` with the following reason: "${escapeLogValue(reason)}"`)}`,
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
							body: `${blue("Email handler forwarded message")}${reset(` with\n  rcptTo: ${escapeLogValue(rcptTo)}${renderEmailHeaders(headers)}`)}`,
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
					const validatedReply = await validateReply(
						parsedIncomingEmail,
						replyMessage as MiniflareEmailMessage
					);
					const finalReply = validatedReply.raw;
					const replyId = messageIdToStorageId(validatedReply.messageId);
					const parentRecordId = messageIdToStorageId(
						parsedIncomingEmail.messageId
					);

					// Store the reply under `email/<session-id>/reply/<replyId>.eml`
					const resp = await env[CoreBindings.SERVICE_LOOPBACK].fetch(
						`http://localhost/core/store-temp-file?email=true&extension=eml&prefix=reply&id=${encodeURIComponent(replyId)}&record=${encodeURIComponent(parentRecordId)}`,
						{
							method: "POST",
							body: finalReply,
						}
					);
					if (!resp.ok) {
						throw new Error(
							`could not store reply temporary file: ${await resp.text()}`
						);
					}
					const file = await resp.text();

					await env[CoreBindings.SERVICE_LOOPBACK].fetch(
						"http://localhost/core/log",
						{
							method: "POST",
							headers: { [SharedHeaders.LOG_LEVEL]: LogLevel.INFO.toString() },
							body: `${blue("Email handler replied to sender")}${reset(` with the following message:\n  ${escapeLogValue(file)}`)}`,
						}
					);

					// The reply MIME already has a message id
					const result = { messageId: validatedReply.messageId };
					events.push({
						type: "reply",
						timestamp: new Date().toISOString(),
						messageId: result.messageId,
					});
					// The full reply is written to disk above; only capture up to the
					// local limit in the store record so it stays under the RPC cap.
					const capturedReply = truncateRawForCapture(finalReply);
					if (capturedReply.truncated) {
						ctx.waitUntil(
							env[CoreBindings.SERVICE_LOOPBACK]
								.fetch("http://localhost/core/log", {
									method: "POST",
									headers: {
										[SharedHeaders.LOG_LEVEL]: LogLevel.WARN.toString(),
									},
									body: `Reply email exceeds the ${MAX_LOCAL_EMAIL_BYTES}-byte local capture limit; the reply was sent, but only the first ${MAX_LOCAL_EMAIL_BYTES} bytes are shown in the Local Explorer.`,
								})
								.catch(() => undefined)
						);
					}
					replies.push({
						messageId: result.messageId,
						sender: replyMessage.from,
						raw: capturedReply.raw,
						rawBase64: capturedReply.rawBase64,
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
				// The Worker has no `email()` handler, so the message could not be
				// delivered. Record it as `unhandled``
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
				replies: replies.map(({ rawBase64: _rawBase64, ...reply }) => reply),
				events,
			},
			{ status: outcome === "ok" ? 200 : 500 }
		);
	} catch (e) {
		outcome = "exception";
		if (isMissingEmailHandlerError(e)) {
			// The Worker has no `email()` handler, so the message could not be
			// delivered. Record it as `unhandled``
			events.splice(0, events.length, {
				type: "unhandled",
				timestamp: new Date().toISOString(),
			});
			await storeReceivedEmail();
			return new Response(
				"Worker does not export an email() handler; message stored without delivery.",
				{ status: 500 }
			);
		}
		await storeReceivedEmail();
		throw e;
	}
}
