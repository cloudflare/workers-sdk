import type { EmailMessage as EmailMessageType } from "@cloudflare/workers-types/experimental";

class EmailMessage implements EmailMessageType {
	public readonly raw: ReadableStream<Uint8Array>;

	public constructor(
		public readonly from: string,
		public readonly to: string,
		raw: ReadableStream<Uint8Array> | string
	) {
		this.raw = typeof raw === "string" ? new Blob([raw]).stream() : raw;
		// This is a bit of hack! We need:
		// - EmailMessage to be constructable (to match production)
		// - EmailMessage to be able to be passed across JSRPC (to support e.g. message.reply(EmailMessage))
		// - EmailMessage properties to be synchronously available (to match production). This rules out `RpcStub`
		// The below is the only solution I could come up with that satisfies these constraints, but if the constraints change
		// this can and should be re-evaluated
		return {
			from,
			to,
			raw: this.raw,
		};
	}
}

export type { EmailMessage as MiniflareEmailMessage };

export default {
	EmailMessage,
};
