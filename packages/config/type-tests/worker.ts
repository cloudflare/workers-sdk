/** The Worker module that `cloudflare.config.ts` uses as its entrypoint. */
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

export class Counter extends DurableObject {}

export class Admin extends WorkerEntrypoint {}

export default {
	scheduled() {},
} satisfies ExportedHandler;
