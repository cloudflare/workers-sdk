import { newWorkersRpcResponse } from "capnweb";
import { EmailMessage } from "cloudflare:email";
import { describe, it, vi } from "vitest";
import proxyWorker from "../templates/remoteBindings/ProxyServerWorker";

vi.mock("capnweb", () => ({ newWorkersRpcResponse: vi.fn() }));
vi.mock("cloudflare:email", () => {
	class MockEmailMessage {
		constructor(
			readonly from: string,
			readonly to: string,
			readonly raw: ReadableStream | string
		) {}
	}
	return { EmailMessage: MockEmailMessage };
});

class SendEmail {
	send = vi.fn<(input: EmailMessage | EmailMessageBuilder) => Promise<void>>();
}

async function sendThroughProxy(input: unknown) {
	const binding = new SendEmail();
	vi.mocked(newWorkersRpcResponse).mockImplementationOnce(
		async (_request, target) => {
			await (target as { send: (input: unknown) => Promise<void> }).send(input);
			return new Response(null, { status: 204 });
		}
	);
	const response = await proxyWorker.fetch(
		new Request("https://example.com/?MF-Binding=EMAIL", {
			headers: { Upgrade: "websocket" },
		}),
		{ EMAIL: binding }
	);
	return { response, send: binding.send };
}

describe("proxy worker email binding", () => {
	const from = "sender@example.com";
	const to = "recipient@example.com";
	const mime = "Subject: Hello\r\n\r\nHello, world!";

	it.for([
		{ field: "raw", format: "stream" },
		{ field: "EmailMessage::raw", format: "stream" },
		{ field: "EmailMessage::raw", format: "string" },
	] as const)(
		"reconstructs a native message from $field ($format)",
		async ({ field, format }, { expect }) => {
			const raw = format === "stream" ? new Blob([mime]).stream() : mime;
			const { response, send } = await sendThroughProxy({
				from,
				to,
				[field]: raw,
			});

			expect(response.status).toBe(204);
			expect(send).toHaveBeenCalledExactlyOnceWith(expect.any(EmailMessage));
			const message = send.mock.calls[0]?.[0];
			expect(message).toMatchObject({ from, to });
			expect(message && "raw" in message && message.raw).toBe(raw);
		}
	);

	it("passes builder messages through unchanged", async ({ expect }) => {
		const builder = { from, to, subject: "Hello", text: "Hello, world!" };
		const { response, send } = await sendThroughProxy(builder);

		expect(response.status).toBe(204);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send.mock.calls[0]?.[0]).toBe(builder);
	});
});
