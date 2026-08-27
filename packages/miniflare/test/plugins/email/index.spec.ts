import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
	EMAIL_PLUGIN,
	getEmailPathsToClean,
	LogLevel,
	Miniflare,
} from "miniflare";
import PostalMime from "postal-mime";
import dedent from "ts-dedent";
import { describe, type ExpectStatic, test, vi } from "vitest";
import {
	singleModuleManifest,
	TestLog,
	useDispose,
	useTmp,
} from "../../test-shared";

const SEND_EMAIL_WORKER = dedent /* javascript */ `
	import { EmailMessage } from "cloudflare:email";

	export default {
		async fetch(request, env, ctx) {

			const url = new URL(request.url);

			await env.SEND_EMAIL.send(new EmailMessage(
				url.searchParams.get("from"),
				url.searchParams.get("to"),
				request.body
			))

			return new Response("ok")
		},
	};
`;

const REPLY_EMAIL_WORKER = (email = "message.raw") => dedent /* javascript */ `
	import { EmailMessage } from "cloudflare:email";

	export default {
		fetch() {},
		async email(message) {
			const m = new EmailMessage(
				message.to,
				message.from,
				${email}
			);
			await message.reply(m);
		}
	};
`;

async function useProjectTmpPath(): Promise<string> {
	return path.join(await useTmp(), "project-tmp");
}

async function expectPersistedEmail(
	log: TestLog,
	expectedEmail: string,
	originalMessageId: string,
	generatedMessageIdDomain: string,
	expect: ExpectStatic
): Promise<void> {
	await vi.waitFor(
		async () => {
			const entry = log.logs.find(
				([type, message]) =>
					type === LogLevel.INFO &&
					message.match(
						/send_email binding called with the following message:\n/
					)
			);
			if (!entry) {
				throw new Error(
					"send_email binding log not found in " +
						JSON.stringify(log.logs, null, 2)
				);
			}
			const fileMatch = entry[1].match(/^Email: (.+)$/m);
			expect(fileMatch).not.toBeNull();
			const file = fileMatch?.[1];
			expect(file).toBeDefined();
			const fileContent = await readFile(String(file), "utf-8");
			const messageId = fileContent.match(/^Message-ID: (.+)$/m)?.[1];
			expect(messageId).toEqual(
				synthesizedMessageId(expect, generatedMessageIdDomain)
			);
			expect(messageId).not.toBe(originalMessageId);
			expect(
				fileContent.replace(
					`Message-ID: ${messageId}`,
					`Message-ID: ${originalMessageId}`
				)
			).toBe(expectedEmail);
		},
		{ timeout: 5_000, interval: 100 }
	);
}

test("Unbound send_email binding works", async ({ expect }) => {
	const log = new TestLog();
	const projectTmpPath = await useProjectTmpPath();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		resourceTmpPath: projectTmpPath,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(SEND_EMAIL_WORKER),
					env: { SEND_EMAIL: { type: "send-email" } },
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
	await expectPersistedEmail(
		log,
		email,
		"<im-a-random-message-id@example.com>",
		"example.com",
		expect
	);
});

test("Invalid email throws", async ({ expect }) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(SEND_EMAIL_WORKER),
					env: { SEND_EMAIL: { type: "send-email" } },
				},
			},
		],
	});

	useDispose(mf);

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: `adfsedfhwiofe`,
			method: "POST",
		}
	);

	expect(await res.text()).toMatch(/^Error: invalid message-id/);
	expect(res.status).toBe(500);
});

test("Single allowed destination send_email binding works", async ({
	expect,
}) => {
	const log = new TestLog();
	const projectTmpPath = await useProjectTmpPath();

	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		resourceTmpPath: projectTmpPath,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(SEND_EMAIL_WORKER),
					env: {
						SEND_EMAIL: {
							type: "send-email",
							destinationAddress: "someone-else@example.com",
						},
					},
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.
	`;

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	await expectPersistedEmail(
		log,
		email,
		"<im-a-random-message-id@example.com>",
		"example.com",
		expect
	);
});

test("Single allowed destination send_email binding throws if destination is not equal", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(SEND_EMAIL_WORKER),
					env: {
						SEND_EMAIL: {
							type: "send-email",
							destinationAddress: "helly.r@example.com",
						},
					},
				},
			},
		],
	});

	useDispose(mf);

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: `From: someone <someone@example.com>
To: someone else <someone-else@example.com>
Message-ID: <im-a-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);

	expect(await res.text()).toMatch(
		/^Error: email to someone-else@example\.com not allowed/
	);
	expect(res.status).toBe(500);
});

test("Multiple allowed destination send_email binding works", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(SEND_EMAIL_WORKER),
					env: {
						SEND_EMAIL: {
							type: "send-email",
							allowedDestinationAddresses: [
								"milchick@example.com",
								"miss-huang@example.com",
							],
						},
					},
				},
			},
		],
	});

	useDispose(mf);

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "milchick@example.com",
			}).toString(),
		{
			body: `From: someone <someone@example.com>
To: someone else <milchick@example.com>
Message-ID: <im-a-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
});

test("Multiple allowed senders send_email binding works", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(SEND_EMAIL_WORKER),
					env: {
						SEND_EMAIL: {
							type: "send-email",
							allowedSenderAddresses: [
								"milchick@example.com",
								"miss-huang@example.com",
							],
						},
					},
				},
			},
		],
	});

	useDispose(mf);

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				to: "someone@example.com",
				from: "milchick@example.com",
			}).toString(),
		{
			body: `To: someone <someone@example.com>
From: someone else <milchick@example.com>
Message-ID: <im-a-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
});

test("Sending email from a sender not in the allowed list does not work", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(SEND_EMAIL_WORKER),
					env: {
						SEND_EMAIL: {
							type: "send-email",
							allowedSenderAddresses: [
								"milchick@example.com",
								"miss-huang@example.com",
							],
						},
					},
				},
			},
		],
	});

	useDispose(mf);

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				to: "someone@example.com",
				from: "notallowed@example.com",
			}).toString(),
		{
			body: `To: someone <someone@example.com>
From: someone else <milchick@example.com>
Message-ID: <im-a-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);

	expect(await res.text()).toMatch(
		/^Error: email from notallowed@example\.com not allowed/
	);
	expect(res.status).toBe(500);
});

test("Multiple allowed send_email binding throws if destination is not equal", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(SEND_EMAIL_WORKER),
					env: {
						SEND_EMAIL: {
							type: "send-email",
							allowedDestinationAddresses: [
								"milchick@example.com",
								"miss-huang@example.com",
							],
						},
					},
				},
			},
		],
	});

	useDispose(mf);

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "helly.r@example.com",
			}).toString(),
		{
			body: `From: someone <someone@example.com>
To: someone else <helly.r@example.com>
Message-ID: <im-a-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);

	expect(await res.text()).toMatch(
		/^Error: email to helly\.r@example\.com not allowed/
	);
	expect(res.status).toBe(500);
});

test("reply validation: x-auto-response-suppress", async ({ expect }) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(REPLY_EMAIL_WORKER()),
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		X-Auto-Response-Suppress: OOF
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	expect(await res.text()).toContain("Original email is not replyable");
});

test("reply validation: Auto-Submitted", async ({ expect }) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(REPLY_EMAIL_WORKER()),
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		Auto-Submitted: true
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	expect(await res.text()).toContain("Original email is not replyable");
});

test("reply validation: only In-Reply-To", async ({ expect }) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(REPLY_EMAIL_WORKER()),
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		In-Reply-To: <im-a-random-parent-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	expect(await res.text()).toContain("Original email is not replyable");
});

test("reply validation: only References", async ({ expect }) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(REPLY_EMAIL_WORKER()),
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		References: <im-a-random-parent-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	expect(await res.text()).toContain("Original email is not replyable");
});

test("reply validation: >100 References", async ({ expect }) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(REPLY_EMAIL_WORKER()),
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		In-Reply-To: <im-a-random-parent-message-id@example.com>
		References: <im-a-random-parent-message-id@example.com> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net> <1234@local.machine.example> <3456@example.net>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	expect(await res.text()).toContain("Original email is not replyable");
	expect(log.logs[1][0]).toBe(LogLevel.ERROR);
	expect(log.logs[1][1].split("\n")[0]).toBe(
		'The incoming email\'s "References" header has more than 100 entries. As such, your Worker cannot respond to this email. Refer to https://developers.cloudflare.com/email-routing/email-workers/reply-email-workers/'
	);
});

test("reply: mismatched From: header", async ({ expect }) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(REPLY_EMAIL_WORKER()),
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	expect(await res.text()).toContain("From: header does not match mail from");
});

test("reply: unparseable", async ({ expect }) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(REPLY_EMAIL_WORKER('""')),
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	expect(await res.text()).toContain("could not parse email");
});

test("reply: generates a message id when omitted", async ({ expect }) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(
						REPLY_EMAIL_WORKER(
							JSON.stringify(dedent`
								From: someone else <someone-else@example.com>
								To: someone <someone@example.com>
								MIME-Version: 1.0
								Content-Type: text/plain
								In-Reply-To: <im-a-random-message-id@example.com>

								This is a random email body.`)
						)
					),
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	expect(await res.text()).toBe("Worker successfully processed email");
	expect(res.status).toBe(200);

	const replyLog = log
		.logsAtLevel(LogLevel.INFO)
		.find((message) =>
			message.startsWith(
				"Email handler replied to sender with the following message:"
			)
		);
	expect(replyLog).toBeDefined();
	const file = replyLog?.match(/^ {2}(.+)$/m)?.[1];
	expect(file).toBeDefined();
	const fileContent = await readFile(String(file), "utf-8");
	expect(fileContent).toMatch(/^Message-ID: <[A-Za-z0-9]{36}@example\.com>$/m);
	expect(fileContent).toContain(
		"References: <im-a-random-message-id@example.com>"
	);
});

test("reply: rejects an empty message id", async ({ expect }) => {
	const mf = new Miniflare({
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(
						REPLY_EMAIL_WORKER(
							JSON.stringify(dedent`
								From: someone else <someone-else@example.com>
								To: someone <someone@example.com>
								Message-ID:
								In-Reply-To: <im-a-random-message-id@example.com>
								MIME-Version: 1.0
								Content-Type: text/plain

								This is a random email body.`)
						)
					),
				},
			},
		],
	});

	useDispose(mf);

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: dedent`
				From: someone <someone@example.com>
				To: someone else <someone-else@example.com>
				Message-ID: <im-a-random-message-id@example.com>
				MIME-Version: 1.0
				Content-Type: text/plain

				This is a random email body.`,
			method: "POST",
		}
	);

	expect(await res.text()).toContain("invalid message-id");
	expect(res.status).toBe(500);
});

test("reply: supports EmailReplyMessageBuilder", async ({ expect }) => {
	const mf = new Miniflare({
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(dedent /* javascript */ `
							export default {
								fetch() {},
								async email(message) {
									await message.reply({
										from: {
											name: 'Reply "Sender" \\\\ Team',
											email: "reply@example.com",
										},
										replyTo: {
											name: "Support",
											email: "support@example.com",
									},
									subject: "Builder reply",
									headers: {
										"X-Builder": "yes",
										"In-Reply-To": "<wrong@example.com>",
										"References": "<wrong@example.com>",
										"Subject": "Wrong subject",
									},
									text: "Plain reply",
									html: "<p>HTML reply</p>",
									attachments: [{
										disposition: "inline",
										contentId: "greeting",
										filename: "greeting.png",
										type: "image/png",
										content: "aGVsbG8=",
									}, {
										disposition: "attachment",
										filename: "bytes.bin",
										type: "application/octet-stream",
										content: new Uint8Array([0, 104, 105, 0]).subarray(1, 3),
									}],
								});
							},
						};
					`),
				},
			},
		],
	});
	useDispose(mf);

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?format=json&from=sender@example.com&to=worker@example.com",
		{
			body: dedent`
				From: Sender <sender@example.com>
				To: Worker <worker@example.com>
				Message-ID: <incoming@example.com>
				In-Reply-To: <root@example.com>
				References: <root@example.com>
				MIME-Version: 1.0
				Content-Type: text/plain

				Incoming body.`,
			method: "POST",
		}
	);
	const result = (await res.json()) as {
		replies: Array<{ messageId: string; sender: string; raw: string }>;
	};

	expect(res.status).toBe(200);
	expect(result.replies).toHaveLength(1);
	const reply = result.replies[0];
	expect(reply?.messageId).toMatch(/^<[A-Za-z0-9]{36}@example\.com>$/);
	expect(reply?.sender).toBe(
		'"Reply \\"Sender\\" \\\\ Team" <reply@example.com>'
	);

	const parsed = await PostalMime.parse(reply?.raw ?? "");
	expect(parsed.from).toMatchObject({
		name: 'Reply "Sender" \\ Team',
		address: "reply@example.com",
	});
	expect(parsed.to).toEqual([
		expect.objectContaining({ address: "sender@example.com" }),
	]);
	expect(parsed.replyTo).toEqual([
		expect.objectContaining({
			name: "Support",
			address: "support@example.com",
		}),
	]);
	expect(parsed.subject).toBe("Builder reply");
	expect(parsed.inReplyTo).toBe("<incoming@example.com>");
	expect(parsed.references).toBe("<root@example.com> <incoming@example.com>");
	expect(parsed.headers).toContainEqual(
		expect.objectContaining({ key: "x-builder", value: "yes" })
	);
	expect(parsed.text).toContain("Plain reply");
	expect(parsed.html).toContain("<p>HTML reply</p>");
	expect(parsed.attachments).toHaveLength(2);
	expect(parsed.attachments[0]).toMatchObject({
		filename: "greeting.png",
		mimeType: "image/png",
		disposition: "inline",
		contentId: "<greeting>",
	});
	const attachmentContent = parsed.attachments[0]?.content;
	expect(
		typeof attachmentContent === "string"
			? attachmentContent
			: new TextDecoder().decode(attachmentContent)
	).toBe("hello");
	expect(parsed.attachments[1]).toMatchObject({
		filename: "bytes.bin",
		mimeType: "application/octet-stream",
		disposition: "attachment",
	});
	const binaryAttachmentContent = parsed.attachments[1]?.content;
	expect(
		typeof binaryAttachmentContent === "string"
			? binaryAttachmentContent
			: new TextDecoder().decode(binaryAttachmentContent)
	).toBe("hi");
});

test("reply: rejects invalid custom header names", async ({ expect }) => {
	const mf = new Miniflare({
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(dedent /* javascript */ `
						export default {
							fetch() {},
							async email(message) {
								await message.reply({
									from: "reply@example.com",
									subject: "Invalid custom header",
									headers: {
										"Invalid Header": "value",
									},
									text: "Reply body",
								});
							},
						};
					`),
				},
			},
		],
	});
	useDispose(mf);

	const response = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?from=sender@example.com&to=worker@example.com",
		{
			body: dedent`
				From: sender@example.com
				To: worker@example.com
				Message-ID: <incoming@example.com>
				MIME-Version: 1.0
				Content-Type: text/plain

				Incoming body.`,
			method: "POST",
		}
	);

	expect(response.status).toBe(500);
	expect(await response.text()).toContain("invalid headers set");
});

test("reply: disallowed header", async ({ expect }) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(
						REPLY_EMAIL_WORKER(
							JSON.stringify(dedent`
								From: someone else <someone-else@example.com>
								To: someone <someone@example.com>
								MIME-Version: 1.0
								Content-Type: text/plain
								Message-ID: <im-a-random-message-id@example.com>
								Received: something

								This is a random email body.`)
						)
					),
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	expect(await res.text()).toContain("invalid headers set");
});

test("reply: missing In-Reply-To", async ({ expect }) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(
						REPLY_EMAIL_WORKER(
							JSON.stringify(dedent`
								From: someone else <someone-else@example.com>
								To: someone <someone@example.com>
								MIME-Version: 1.0
								Content-Type: text/plain
								Message-ID: <im-a-random-message-id@example.com>

								This is a random email body.`)
						)
					),
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	expect(await res.text()).toContain(
		"no In-Reply-To header found in reply message"
	);
});

test("reply: wrong In-Reply-To", async ({ expect }) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(
						REPLY_EMAIL_WORKER(
							JSON.stringify(dedent`
								From: someone else <someone-else@example.com>
								To: someone <someone@example.com>
								MIME-Version: 1.0
								Content-Type: text/plain
								In-Reply-To: random
								Message-ID: <im-a-random-message-id@example.com>

								This is a random email body.`)
						)
					),
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	expect(await res.text()).toContain(
		"In-Reply-To does not match original Message-ID"
	);
});

test("reply: invalid references", async ({ expect }) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(
						REPLY_EMAIL_WORKER(
							JSON.stringify(dedent`
								From: someone else <someone-else@example.com>
								To: someone <someone@example.com>
								MIME-Version: 1.0
								Content-Type: text/plain
								In-Reply-To: <im-a-random-parent-message-id@example.com>
								Message-ID: <im-a-random-message-id@example.com>
								References: <im-a-random-other-message-id@example.com>

								This is a random email body.`)
						)
					),
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-parent-message-id@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	expect(await res.text()).toContain("provided References header is invalid");
});

test("reply: references generated correctly", async ({ expect }) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(
						REPLY_EMAIL_WORKER(
							JSON.stringify(dedent`
								From: someone else <someone-else@example.com>
								To: someone <someone@example.com>
								MIME-Version: 1.0
								Content-Type: text/plain
								In-Reply-To: <im-a-random-parent-message-id@example.com>
								Message-ID: <im-a-random-message-id@example.com>

								This is a random email body.`)
						)
					),
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <im-a-random-parent-message-id@example.com>
		In-Reply-To: <root@example.com>
		References: <root@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This is a random email body.`;

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);
	expect(await res.text()).toBe("Worker successfully processed email");
	expect(res.status).toBe(200);
	expect(log.logs[1][0]).toBe(LogLevel.INFO);
	expect(log.logs[1][1].split("\n")[0]).toBe(
		"Email handler replied to sender with the following message:"
	);

	const message = log.logs[1][1];
	const fileMatch = message.match(/^ {2}(.+)$/m);
	expect(fileMatch).not.toBeNull();
	const file = fileMatch?.[1];
	expect(file).toBeDefined();
	const fileContent = await readFile(String(file), "utf-8");
	expect(fileContent).toBeTruthy();
	expect(fileContent).toMatch(/^Message-ID: <[A-Za-z0-9]{36}@example\.com>$/m);
	expect(fileContent).not.toContain(
		"Message-ID: <im-a-random-message-id@example.com>"
	);
	expect(fileContent).toContain(
		"References: <root@example.com> <im-a-random-parent-message-id@example.com>"
	);
});

const MESSAGE_BUILDER_WORKER = dedent /* javascript */ `
	export default {
		async fetch(request, env) {
			const builder = await request.json();
			await env.SEND_EMAIL.send(builder);
			return new Response("ok");
		},
	};
`;

const MESSAGE_BUILDER_RETURNS_RESULT_WORKER = dedent /* javascript */ `
	export default {
		async fetch(request, env) {
			const builder = await request.json();
			const result = await env.SEND_EMAIL.send(builder);
			return Response.json(result);
		},
	};
`;

interface MessageBuilderMiniflareOptions {
	log?: TestLog;
	resourceTmpPath?: string;
	workerScript?: string;
	allowedDestinationAddresses?: string[];
	allowedSenderAddresses?: string[];
}

function useMessageBuilderMiniflare({
	log,
	resourceTmpPath,
	workerScript = MESSAGE_BUILDER_WORKER,
	allowedDestinationAddresses,
	allowedSenderAddresses,
}: MessageBuilderMiniflareOptions = {}): Miniflare {
	const mf = new Miniflare({
		...(log === undefined
			? {}
			: {
					log,
					handleStructuredLogs({ message }: { message: string }) {
						log.info(message);
					},
				}),
		resourceTmpPath,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(workerScript),
					env: {
						SEND_EMAIL: {
							type: "send-email",
							allowedDestinationAddresses,
							allowedSenderAddresses,
						},
					},
				},
			},
		],
	});
	useDispose(mf);
	return mf;
}

async function waitForMessageBuilderLog(log: TestLog): Promise<string> {
	return vi.waitFor(
		() => {
			const message = log.logs.find(
				([type, message]) =>
					type === LogLevel.INFO &&
					message.includes("send_email binding called with MessageBuilder:")
			)?.[1];
			if (message === undefined) {
				throw new Error(
					"send_email binding log not found in " +
						JSON.stringify(log.logs, null, 2)
				);
			}
			return message;
		},
		{ timeout: 5_000, interval: 100 }
	);
}

function getLoggedArtifactPath(message: string, prefix: string): string {
	const line = message.split("\n").find((line) => line.startsWith(prefix));
	if (line === undefined) {
		throw new Error(`Artifact log line starting with "${prefix}" not found`);
	}
	return line.slice(prefix.length);
}

test("MessageBuilder with text only", async ({ expect }) => {
	const log = new TestLog();
	const projectTmpPath = await useProjectTmpPath();
	const mf = useMessageBuilderMiniflare({
		log,
		resourceTmpPath: projectTmpPath,
	});

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Test Email",
			text: "Hello, this is a test email!",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	const message = await waitForMessageBuilderLog(log);
	expect(message).toContain("From: sender@example.com");
	expect(message).toContain("To: recipient@example.com");
	expect(message).toContain("Subject: Test Email");
	expect(
		await readFile(getLoggedArtifactPath(message, "Text: "), "utf-8")
	).toBe("Hello, this is a test email!");
});

test("MessageBuilder with HTML only", async ({ expect }) => {
	const mf = useMessageBuilderMiniflare();

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "HTML Test",
			html: "<h1>Hello World</h1>",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
});

test("MessageBuilder with both text and HTML", async ({ expect }) => {
	const mf = useMessageBuilderMiniflare();

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Multipart Test",
			text: "Plain text",
			html: "<p>HTML</p>",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
});

test("MessageBuilder with attachments", async ({ expect }) => {
	const log = new TestLog();
	const projectTmpPath = await useProjectTmpPath();
	const mf = useMessageBuilderMiniflare({
		log,
		resourceTmpPath: projectTmpPath,
	});

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Attachment Test",
			text: "See attachment",
			attachments: [
				{
					disposition: "attachment",
					filename: "test.txt",
					type: "text/plain",
					content: "base64content",
				},
			],
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	const message = await waitForMessageBuilderLog(log);
	const attachmentFile = getLoggedArtifactPath(
		message,
		"Attachment (attachment): test.txt -> "
	);
	expect(await readFile(attachmentFile, "utf-8")).toBe("base64content");
});

test("MessageBuilder log output format snapshot", async ({ expect }) => {
	const log = new TestLog();
	const projectTmpPath = await useProjectTmpPath();
	const mf = useMessageBuilderMiniflare({
		log,
		resourceTmpPath: projectTmpPath,
	});

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: { name: "Alice Sender", email: "alice@example.com" },
			to: ["bob@example.com", "charlie@example.com"],
			cc: "team@example.com",
			bcc: "boss@example.com",
			subject: "Quarterly Report",
			text: "Please see the attached quarterly report.",
			html: "<h1>Quarterly Report</h1><p>Please see the attached report.</p>",
			attachments: [
				{
					disposition: "inline",
					contentId: "logo123",
					filename: "logo.png",
					type: "image/png",
					content: "iVBORw0KGgo=",
				},
				{
					filename: "report.pdf",
					type: "application/pdf",
					content: "JVBERi0xLjc=",
				},
			],
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	const message = await waitForMessageBuilderLog(log);
	const cleanMessage = message
		.replace(/\x1b\[[0-9;]*m/g, "")
		.replace(
			/(?:[A-Z]:\\|\/)[^\s]*[/\\](email-text|email-html|email-attachment)[/\\][^/\\\s]+\.(txt|html|png|pdf)/g,
			"/$1/[FILE].$2"
		);

	expect(cleanMessage).toMatchInlineSnapshot(`
		"send_email binding called with MessageBuilder:
		From: "Alice Sender" <alice@example.com>
		To: bob@example.com, charlie@example.com
		Cc: team@example.com
		Bcc: boss@example.com
		Subject: Quarterly Report

		Text: /email-text/[FILE].txt
		HTML: /email-html/[FILE].html
		Attachment (inline): logo.png -> /email-attachment/[FILE].png
		Attachment (attachment): report.pdf -> /email-attachment/[FILE].pdf"
	`);
});

test("MessageBuilder with inline attachment", async ({ expect }) => {
	const mf = useMessageBuilderMiniflare();

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Inline Test",
			html: '<img src="cid:logo" />',
			attachments: [
				{
					disposition: "inline",
					contentId: "logo",
					filename: "logo.png",
					type: "image/png",
					content: "base64imagedata",
				},
			],
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
});

test("MessageBuilder with EmailAddress objects", async ({ expect }) => {
	const log = new TestLog();
	const mf = useMessageBuilderMiniflare({
		log,
	});

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: { name: "John Doe", email: "john@example.com" },
			to: { name: "Jane Smith", email: "jane@example.com" },
			subject: "Named Address Test",
			text: "Hello",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	const message = await waitForMessageBuilderLog(log);
	expect(message).toContain('"John Doe" <john@example.com>');
	expect(message).toContain('"Jane Smith" <jane@example.com>');
	expect(message).toContain("Subject: Named Address Test");
});

test("MessageBuilder with named recipient arrays", async ({ expect }) => {
	const log = new TestLog();
	const mf = useMessageBuilderMiniflare({
		log,
	});

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: { name: "John Doe", email: "john@example.com" },
			to: [
				{ name: "Jane Smith", email: "jane@example.com" },
				{ name: "Bob Wilson", email: "bob@example.com" },
			],
			cc: [{ name: "CC One", email: "cc1@example.com" }],
			bcc: [
				{ name: "BCC One", email: "bcc1@example.com" },
				{ name: "BCC Two", email: "bcc2@example.com" },
			],
			subject: "Named Recipient Arrays Test",
			text: "Hello",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	const message = await waitForMessageBuilderLog(log);
	expect(message).toContain(
		'To: "Jane Smith" <jane@example.com>, "Bob Wilson" <bob@example.com>'
	);
	expect(message).toContain('Cc: "CC One" <cc1@example.com>');
	expect(message).toContain(
		'Bcc: "BCC One" <bcc1@example.com>, "BCC Two" <bcc2@example.com>'
	);
	expect(message).toContain("Subject: Named Recipient Arrays Test");
});

test("MessageBuilder with mixed recipients", async ({ expect }) => {
	const log = new TestLog();
	const mf = useMessageBuilderMiniflare({
		log,
	});

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: [
				"plain@example.com",
				{ name: "Jane Doe", email: "jane@example.com" },
			],
			cc: [
				{ name: "CC Person", email: "cc@example.com" },
				"plain-cc@example.com",
			],
			bcc: ["plain-bcc@example.com"],
			subject: "Mixed Recipients Test",
			text: "Hello",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	const message = await waitForMessageBuilderLog(log);
	expect(message).toContain(
		'To: plain@example.com, "Jane Doe" <jane@example.com>'
	);
	expect(message).toContain(
		'Cc: "CC Person" <cc@example.com>, plain-cc@example.com'
	);
	expect(message).toContain("Bcc: plain-bcc@example.com");
	expect(message).toContain("Subject: Mixed Recipients Test");
});

test("MessageBuilder with multiple recipients", async ({ expect }) => {
	const log = new TestLog();
	const mf = useMessageBuilderMiniflare({
		log,
	});

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: ["recipient1@example.com", "recipient2@example.com"],
			cc: "cc@example.com",
			bcc: ["bcc1@example.com", "bcc2@example.com"],
			subject: "Multiple Recipients",
			text: "Hello all",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	const message = await waitForMessageBuilderLog(log);
	expect(message).toContain(
		"To: recipient1@example.com, recipient2@example.com"
	);
	expect(message).toContain("Cc: cc@example.com");
	expect(message).toContain("Bcc: bcc1@example.com, bcc2@example.com");
});

test("MessageBuilder with custom headers", async ({ expect }) => {
	const mf = useMessageBuilderMiniflare();

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "Custom Headers",
			text: "Test",
			headers: {
				"X-Custom": "value",
			},
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
});

test("MessageBuilder respects allowed_destination_addresses", async ({
	expect,
}) => {
	const mf = useMessageBuilderMiniflare({
		allowedDestinationAddresses: ["allowed@example.com"],
	});

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "notallowed@example.com",
			subject: "Test",
			text: "Test",
		}),
	});

	expect(res.status).toBe(500);
	const error = await res.text();
	expect(error).toContain("not allowed");
});

test("MessageBuilder respects allowed_sender_addresses", async ({ expect }) => {
	const mf = useMessageBuilderMiniflare({
		allowedSenderAddresses: ["allowed@example.com"],
	});

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "notallowed@example.com",
			to: "recipient@example.com",
			subject: "Test",
			text: "Test",
		}),
	});

	expect(res.status).toBe(500);
	const error = await res.text();
	expect(error).toContain("not allowed");
});

test("MessageBuilder allowed_destination_addresses with named recipients", async ({
	expect,
}) => {
	const mf = useMessageBuilderMiniflare({
		allowedDestinationAddresses: ["allowed@example.com"],
	});

	// Named allowed recipient should succeed
	const resAllowed = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: { name: "Allowed User", email: "allowed@example.com" },
			subject: "Test",
			text: "Test",
		}),
	});
	expect(resAllowed.status).toBe(200);
	expect(await resAllowed.text()).toBe("ok");

	// Named disallowed recipient should fail
	const resDisallowed = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: { name: "Blocked User", email: "blocked@example.com" },
			subject: "Test",
			text: "Test",
		}),
	});
	expect(resDisallowed.status).toBe(500);
	expect(await resDisallowed.text()).toContain("not allowed");
});

test("MessageBuilder allowed_sender_addresses with named from", async ({
	expect,
}) => {
	const mf = useMessageBuilderMiniflare({
		allowedSenderAddresses: ["allowed@example.com"],
	});

	// Named allowed sender should succeed
	const resAllowed = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: { name: "Allowed Sender", email: "allowed@example.com" },
			to: "recipient@example.com",
			subject: "Test",
			text: "Test",
		}),
	});
	expect(resAllowed.status).toBe(200);
	expect(await resAllowed.text()).toBe("ok");

	// Named disallowed sender should fail
	const resDisallowed = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: { name: "Blocked Sender", email: "blocked@example.com" },
			to: "recipient@example.com",
			subject: "Test",
			text: "Test",
		}),
	});
	expect(resDisallowed.status).toBe(500);
	expect(await resDisallowed.text()).toContain("not allowed");
});

test("MessageBuilder with RFC5322 string addresses", async ({ expect }) => {
	const log = new TestLog();
	const mf = useMessageBuilderMiniflare({
		log,
	});

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: '"John Doe" <john@example.com>',
			to: ['"Jane Smith" <jane@example.com>', "plain@example.com"],
			cc: '"CC Person" <cc@example.com>',
			bcc: ['"BCC Person" <bcc@example.com>'],
			subject: "RFC5322 Address Test",
			text: "Hello",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	const message = await waitForMessageBuilderLog(log);
	expect(message).toContain('From: "John Doe" <john@example.com>');
	expect(message).toContain(
		'To: "Jane Smith" <jane@example.com>, plain@example.com'
	);
	expect(message).toContain('Cc: "CC Person" <cc@example.com>');
	expect(message).toContain('Bcc: "BCC Person" <bcc@example.com>');
	expect(message).toContain("Subject: RFC5322 Address Test");
});

test("MessageBuilder allowed_destination_addresses with RFC5322 string recipients", async ({
	expect,
}) => {
	const mf = useMessageBuilderMiniflare({
		allowedDestinationAddresses: ["allowed@example.com"],
	});

	// RFC5322-formatted allowed recipient should succeed
	const resAllowed = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: '"Allowed User" <allowed@example.com>',
			subject: "Test",
			text: "Test",
		}),
	});
	expect(resAllowed.status).toBe(200);
	expect(await resAllowed.text()).toBe("ok");

	// RFC5322-formatted disallowed recipient should fail
	const resDisallowed = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: '"Blocked User" <blocked@example.com>',
			subject: "Test",
			text: "Test",
		}),
	});
	expect(resDisallowed.status).toBe(500);
	expect(await resDisallowed.text()).toContain("not allowed");
});

test("MessageBuilder backward compatibility - old EmailMessage API still works", async ({
	expect,
}) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(SEND_EMAIL_WORKER),
					env: { SEND_EMAIL: { type: "send-email" } },
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@example.com>
		To: someone else <someone-else@example.com>
		Message-ID: <backward-compat-test@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		This tests backward compatibility.`;

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@example.com",
				to: "someone-else@example.com",
			}).toString(),
		{
			body: email,
			method: "POST",
		}
	);

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);
});

const SEND_EMAIL_RETURNS_RESULT_WORKER = dedent /* javascript */ `
	import { EmailMessage } from "cloudflare:email";

	export default {
		async fetch(request, env) {
			const url = new URL(request.url);
			const result = await env.SEND_EMAIL.send(new EmailMessage(
				url.searchParams.get("from"),
				url.searchParams.get("to"),
				request.body
			));
			return Response.json(result);
		},
	};
`;

// Both branches return a synthesized id with the sender's domain.
function synthesizedMessageId(expect: ExpectStatic, domain: string) {
	return expect.stringMatching(
		new RegExp(`^<[A-Za-z0-9]{36}@${domain.replace(/\./g, "\\.")}>$`)
	);
}

test("send() on an EmailMessage returns a synthesized messageId", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(SEND_EMAIL_RETURNS_RESULT_WORKER),
					env: { SEND_EMAIL: { type: "send-email" } },
				},
			},
		],
	});

	useDispose(mf);

	const email = dedent`
		From: someone <someone@sender.domain>
		To: someone else <someone-else@example.com>
		Message-ID: <do-not-echo-this@example.com>
		MIME-Version: 1.0
		Content-Type: text/plain

		body`;

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@sender.domain",
				to: "someone-else@example.com",
			}).toString(),
		{ body: email, method: "POST" }
	);

	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({
		messageId: synthesizedMessageId(expect, "sender.domain"),
	});
});

test("send() on an EmailMessage larger than 1 MiB is captured without the local explorer", async ({
	expect,
}) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(SEND_EMAIL_RETURNS_RESULT_WORKER),
					env: { SEND_EMAIL: { type: "send-email" } },
				},
			},
		],
	});

	useDispose(mf);

	const email =
		[
			"From: someone <someone@sender.domain>",
			"To: someone else <someone-else@example.com>",
			"Message-ID: <large-send@example.com>",
			"MIME-Version: 1.0",
			"Content-Type: text/plain",
			"",
			"x".repeat(2 * 1024 * 1024),
		].join("\r\n") + "\r\n";

	const res = await mf.dispatchFetch(
		"http://localhost/?" +
			new URLSearchParams({
				from: "someone@sender.domain",
				to: "someone-else@example.com",
			}).toString(),
		{ body: email, method: "POST" }
	);

	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({
		messageId: synthesizedMessageId(expect, "sender.domain"),
	});
	await vi.waitFor(() => {
		expect(log.logsAtLevel(LogLevel.INFO)).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					"send_email binding called with the following message:"
				),
			])
		);
	});
	expect(log.logsAtLevel(LogLevel.WARN)).not.toEqual(
		expect.arrayContaining([expect.stringContaining("local storage row")])
	);
	expect(log.logsAtLevel(LogLevel.WARN)).not.toEqual(
		expect.arrayContaining([expect.stringContaining("Failed to capture")])
	);
});

test("receiving an email larger than 1 MiB is captured without the local explorer", async ({
	expect,
}) => {
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		handleStructuredLogs({ message }: { message: string }) {
			log.info(message);
		},
		unsafeTriggerHandlers: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(dedent /* javascript */ `
						export default {
							async email(message) {
								await message.forward("forwarded@example.com");
							},
						};
					`),
				},
			},
		],
	});

	useDispose(mf);

	const email =
		[
			"From: someone <someone@sender.domain>",
			"To: someone else <someone-else@example.com>",
			"Message-ID: <large-received@example.com>",
			"MIME-Version: 1.0",
			"Content-Type: text/plain",
			"",
			"x".repeat(2 * 1024 * 1024),
		].join("\r\n") + "\r\n";

	const res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/local/email?" +
			new URLSearchParams({
				from: "someone@sender.domain",
				to: "someone-else@example.com",
				format: "json",
			}).toString(),
		{ body: email, method: "POST" }
	);

	expect(res.status).toBe(200);
	expect(await res.json()).toMatchObject({ outcome: "ok" });
	expect(log.logsAtLevel(LogLevel.INFO)).toEqual(
		expect.arrayContaining([
			expect.stringContaining("Email handler forwarded message"),
		])
	);
	expect(log.logsAtLevel(LogLevel.WARN)).not.toEqual(
		expect.arrayContaining([expect.stringContaining("local storage row")])
	);
	expect(log.logsAtLevel(LogLevel.WARN)).not.toEqual(
		expect.arrayContaining([expect.stringContaining("Failed to capture")])
	);
});

test("send() on a MessageBuilder returns a synthesized messageId", async ({
	expect,
}) => {
	const mf = useMessageBuilderMiniflare({
		workerScript: MESSAGE_BUILDER_RETURNS_RESULT_WORKER,
	});

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@sender.domain",
			to: "recipient@example.com",
			subject: "s",
			text: "t",
		}),
	});

	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({
		messageId: synthesizedMessageId(expect, "sender.domain"),
	});
});

test("send() on a MessageBuilder larger than 1 MiB is captured without the local explorer", async ({
	expect,
}) => {
	const log = new TestLog();
	const mf = useMessageBuilderMiniflare({
		log,
		workerScript: MESSAGE_BUILDER_RETURNS_RESULT_WORKER,
	});

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@sender.domain",
			to: "recipient@example.com",
			subject: "Large builder",
			text: "y".repeat(2 * 1024 * 1024),
		}),
	});

	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({
		messageId: synthesizedMessageId(expect, "sender.domain"),
	});
	await waitForMessageBuilderLog(log);
	expect(log.logsAtLevel(LogLevel.WARN)).not.toEqual(
		expect.arrayContaining([expect.stringContaining("local storage row")])
	);
	expect(log.logsAtLevel(LogLevel.WARN)).not.toEqual(
		expect.arrayContaining([expect.stringContaining("Failed to capture")])
	);
});

test("send_email binding is available from getBindings", async ({ expect }) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(""),
					env: { SEND_EMAIL: { type: "send-email" } },
				},
			},
		],
	});

	useDispose(mf);

	const env = await mf.getBindings<{
		SEND_EMAIL: {
			send(message: {
				from: string;
				to: string;
				subject: string;
				text: string;
			}): Promise<{ messageId: string }>;
		};
	}>();
	const result = await env.SEND_EMAIL.send({
		from: "sender@sender.domain",
		to: "recipient@example.com",
		subject: "s",
		text: "t",
	});

	expect(result).toEqual({
		messageId: synthesizedMessageId(expect, "sender.domain"),
	});
});

test("disposing does not remove a concurrent email session", async ({
	expect,
}) => {
	const projectTmpPath = await useProjectTmpPath();
	const mf = new Miniflare({
		resourceTmpPath: projectTmpPath,
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-03-17",
					manifest: singleModuleManifest(SEND_EMAIL_WORKER),
					env: { SEND_EMAIL: { type: "send-email" } },
				},
			},
		],
	});
	let disposed = false;

	try {
		// Sending an email creates this instance's project email session
		// directory under `<projectTmpPath>/email/<session-id>`.
		const email = dedent`
			From: someone <someone@example.com>
			To: someone else <someone-else@example.com>
			Message-ID: <concurrent-session@example.com>
			MIME-Version: 1.0
			Content-Type: text/plain

			Creates a project email session`;
		const response = await mf.dispatchFetch(
			"http://localhost/?" +
				new URLSearchParams({
					from: "someone@example.com",
					to: "someone-else@example.com",
				}).toString(),
			{ method: "POST", body: email }
		);
		expect(await response.text()).toBe("ok");

		const emailParentPath = path.join(projectTmpPath, "email");
		const sessionName = await vi.waitFor(async () => {
			const sessions = await readdir(emailParentPath);
			if (sessions[0] === undefined) {
				throw new Error("Expected an email session directory");
			}
			return sessions[0];
		});
		const concurrentSessionPath = path.join(
			emailParentPath,
			"concurrent-session"
		);
		await mkdir(concurrentSessionPath);

		await mf.dispose();
		disposed = true;

		expect(existsSync(path.join(emailParentPath, sessionName))).toBe(false);
		expect(existsSync(concurrentSessionPath)).toBe(true);
	} finally {
		if (!disposed) {
			await mf.dispose();
		}
	}
});

describe("EMAIL_PLUGIN.getServices", () => {
	test("creates a worker-scoped send_email service with capture bindings", async ({
		expect,
	}) => {
		const tmp = await useTmp();

		const result = await EMAIL_PLUGIN.getServices({
			options: {
				config: { env: { SEND_EMAIL: { type: "send-email" } } },
			},
			sharedOptions: {},
			tmpPath: tmp,
			resourceTmpPath: undefined,
			workerNames: ["default"],
			workerIndex: 0,
		} as unknown as Parameters<typeof EMAIL_PLUGIN.getServices>[0]);

		if (!Array.isArray(result)) {
			throw new Error("Expected getServices to return an array of services");
		}
		const services = result;

		expect(services).toHaveLength(1);
		expect(services[0]?.name).toBe("SEND-EMAIL-WORKER:default:SEND_EMAIL");
		if (services[0] === undefined || !("worker" in services[0])) {
			throw new Error("Expected send_email worker service to be present");
		}
		const worker = services[0].worker;
		if (worker === undefined) {
			throw new Error("Expected send_email worker service configuration");
		}
		const bindings = worker.bindings ?? [];
		expect(
			bindings.find((binding) => binding.name === "MINIFLARE_EMAIL_STORE")
		).toMatchObject({ service: { name: "email:store" } });
		expect(
			bindings.find((binding) => binding.name === "SEND_EMAIL_OWNER_WORKER")
		).toMatchObject({ json: JSON.stringify("default") });
	});
});

describe("getEmailPathsToClean", () => {
	test("returns the project session directory when a project temp path is supplied", ({
		expect,
	}) => {
		const tmpPath = path.join("/tmp", "miniflare-abc123");
		const projectTmpPath = path.join("/project", ".wrangler", "tmp");

		expect(getEmailPathsToClean(projectTmpPath, tmpPath)).toEqual({
			sessionDir: path.join(projectTmpPath, "email", "miniflare-abc123"),
			parentDir: path.join(projectTmpPath, "email"),
		});
	});

	test("returns undefined when no project temp path is supplied", ({
		expect,
	}) => {
		const tmpPath = path.join("/tmp", "miniflare-abc123");
		expect(getEmailPathsToClean(undefined, tmpPath)).toBeUndefined();
	});
});

test("MessageBuilder writes files to system temp when resourceTmpPath is unset", async ({
	expect,
}) => {
	const log = new TestLog();
	const mf = useMessageBuilderMiniflare({
		log,
	});

	const res = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({
			from: "sender@example.com",
			to: "recipient@example.com",
			subject: "System Location Test",
			text: "This should appear in system temp only",
		}),
	});

	expect(await res.text()).toBe("ok");
	expect(res.status).toBe(200);

	const message = await waitForMessageBuilderLog(log);
	const textPath = getLoggedArtifactPath(message, "Text: ");
	expect(existsSync(textPath)).toBe(true);
	expect(await readFile(textPath, "utf-8")).toBe(
		"This should appear in system temp only"
	);
});
