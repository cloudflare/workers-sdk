import { RAW_EMAIL } from "./constants";
import type { EmailMessage as EmailMessageType } from "@cloudflare/workers-types/experimental";

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
		// The below is the only solution I could some up with that satisfies these contraints, but if the contrainsts change
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
