import { LogLevel, Miniflare } from "miniflare";
import dedent from "ts-dedent";
import { expect, test, vi } from "vitest";
import { singleModuleManifest, TestLog, useDispose } from "../../test-shared";

// Mirrors the reproduction from
// https://github.com/cloudflare/workers-sdk/issues/16788: each request sends a
// MessageBuilder whose `to` or `from` EmailAddress has no `name` (or the
// named control), and reports what the binding did.
const NAMELESS_ADDRESS_WORKER = dedent /* javascript */ `
	export default {
		async fetch(request, env) {
			const c = new URL(request.url).searchParams.get("case");
			const msg = {
				from: "sender@sender.domain",
				to: { email: "recipient@example.com", name: "User" },
				subject: "hello",
				text: "body",
			};
			if (c === "to") msg.to = { email: "recipient@example.com" };
			if (c === "from") msg.from = { email: "sender@sender.domain" };
			try {
				const result = await env.SEND_EMAIL.send(msg);
				return Response.json({ ok: true, ...result });
			} catch (e) {
				return Response.json({
					ok: false,
					name: e.name,
					message: e.message,
				});
			}
		},
	};
`;

interface SendResult {
	ok: boolean;
	name?: string;
	message?: string;
	messageId?: string;
}

function useNamelessAddressMiniflare(log?: TestLog): Miniflare {
	const mf = new Miniflare({
		...(log === undefined
			? {}
			: {
					log,
					handleStructuredLogs({ message }: { message: string }) {
						log.info(message);
					},
				}),
		workers: [
			{
				config: {
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(NAMELESS_ADDRESS_WORKER),
					env: { SEND_EMAIL: { type: "send-email" } },
				},
			},
		],
	});
	useDispose(mf);
	return mf;
}

async function sendCase(mf: Miniflare, c: string): Promise<SendResult> {
	const res = await mf.dispatchFetch(`http://localhost/?case=${c}`);
	return (await res.json()) as SendResult;
}

test("send() on a MessageBuilder with a name-less `to` EmailAddress rejects with a TypeError", async ({
	expect,
}) => {
	const mf = useNamelessAddressMiniflare();

	const result = await sendCase(mf, "to");

	expect(result.ok).toBe(false);
	expect(`${result.name}: ${result.message}`).toMatch(/TypeError/);
});

test("send() on a MessageBuilder with a name-less `from` EmailAddress rejects with a TypeError", async ({
	expect,
}) => {
	const mf = useNamelessAddressMiniflare();

	const result = await sendCase(mf, "from");

	expect(result.ok).toBe(false);
	expect(`${result.name}: ${result.message}`).toMatch(/TypeError/);
});

test("send() on a MessageBuilder with named EmailAddresses still succeeds and is captured", async ({
	expect,
}) => {
	const log = new TestLog();
	const mf = useNamelessAddressMiniflare(log);

	const result = await sendCase(mf, "named");

	expect(result).toEqual({
		ok: true,
		messageId: expect.stringMatching(/^<[A-Za-z0-9]{36}@sender\.domain>$/),
	});

	const message = await vi.waitFor(() => {
		const entry = log.logs.find(
			([type, message]) =>
				type === LogLevel.INFO &&
				message.includes("send_email binding called with MessageBuilder:")
		)?.[1];
		if (entry === undefined) {
			throw new Error(
				"send_email binding log not found in " +
					JSON.stringify(log.logs, null, 2)
			);
		}
		return entry;
	});
	expect(message).toContain('"User" <recipient@example.com>');
	expect(log.logsAtLevel(LogLevel.WARN)).toEqual([]);
});
