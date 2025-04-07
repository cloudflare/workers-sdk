import { RAW_EMAIL } from "./constants";
import type { EmailMessage as EmailMessageType } from "@cloudflare/workers-types/experimental";

// Because `EmailMessage` is not on the runtime, we use a different type for it, read below
// for more details:
export type MiniflareEmailMessage = {
	from: string;
	to: string;
	[RAW_EMAIL]: ReadableStream<Uint8Array>;
};

class EmailMessage implements EmailMessageType {
	public constructor(
		public readonly from: string,
		public readonly to: string,
		private raw: ReadableStream | string
	) {
		// @ts-expect-error This is a bit of hack! We need:
		// - EmailMessage to be constructable (to match production)
		// - EmailMessage to be able to be passed across JSRPC (to support e.g. message.reply(EmailMessage))
		// - EmailMessage properties to be synchronously available (to match production). This rules out `RpcStub`
		// The below is the only solution I could some up with that satisfies these constraints, but if the constraints change
		// this can and should be re-evaluated
		return {
			from,
			to,
			// @ts-expect-error We need to be able to access the raw contents of an EmailMessage in entry.worker.ts
			[RAW_EMAIL]: raw,
		};
	}
}
export default {
	EmailMessage,
};
