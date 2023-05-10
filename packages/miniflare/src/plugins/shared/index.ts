import { z } from "zod";
import { Service, Worker_Binding, Worker_Module } from "../../runtime";
import { Awaitable, Log, OptionalZodTypeOf } from "../../shared";
import { GatewayConstructor } from "./gateway";
import { RouterConstructor } from "./router";

// Maps **service** names to the Durable Object class names exported by them
export type DurableObjectClassNames = Map<
	string,
	Map</* className */ string, /* unsafeUniqueKey */ string | undefined>
>;

export const QueueConsumerOptionsSchema = z.object({
	// https://developers.cloudflare.com/queues/platform/configuration/#consumer
	// https://developers.cloudflare.com/queues/platform/limits/
	maxBatchSize: z.number().min(0).max(100).optional(),
	maxBatchTimeout: z.number().min(0).max(30).optional(), // seconds
	maxRetires: z.number().min(0).max(100).optional(),
	deadLetterQueue: z.ostring(),
});
export type QueueConsumerOptions = z.infer<typeof QueueConsumerOptionsSchema>;
export interface QueueConsumer extends QueueConsumerOptions {
	workerName: string;
	deadLetterConsumer?: QueueConsumer;
}

// Maps queue names to the Worker that wishes to consume it. Note each queue
// can only be consumed by one Worker, but one Worker may consume multiple
// queues. Support for multiple consumers of a single queue is not planned
// anytime soon.
export type QueueConsumers = Map<string, QueueConsumer>;

export interface PluginServicesOptions<
	Options extends z.ZodType,
	SharedOptions extends z.ZodType | undefined,
> {
	log: Log;
	options: z.infer<Options>;
	sharedOptions: OptionalZodTypeOf<SharedOptions>;
	workerBindings: Worker_Binding[];
	workerIndex: number;
	additionalModules: Worker_Module[];
	tmpPath: string;

	// ~~Leaky abstractions~~ "Plugin specific options" :)
	durableObjectClassNames: DurableObjectClassNames;
	queueConsumers: QueueConsumers;
}

export interface PluginBase<
	Options extends z.ZodType,
	SharedOptions extends z.ZodType | undefined,
> {
	options: Options;
	getBindings(
		options: z.infer<Options>,
		workerIndex: number
	): Awaitable<Worker_Binding[] | void>;
	getServices(
		options: PluginServicesOptions<Options, SharedOptions>
	): Awaitable<Service[] | void>;
}

export type Plugin<
	Options extends z.ZodType,
	SharedOptions extends z.ZodType | undefined = undefined,
	Gateway = undefined,
> = PluginBase<Options, SharedOptions> &
	(SharedOptions extends undefined
		? { sharedOptions?: undefined }
		: { sharedOptions: SharedOptions }) &
	(Gateway extends undefined
		? { gateway?: undefined; router?: undefined }
		: {
				gateway: GatewayConstructor<Gateway>;
				router: RouterConstructor<Gateway>;
		  });

export function namespaceEntries(
	namespaces?: Record<string, string> | string[]
): [bindingName: string, id: string][] {
	if (Array.isArray(namespaces)) {
		return namespaces.map((bindingName) => [bindingName, bindingName]);
	} else if (namespaces !== undefined) {
		return Object.entries(namespaces);
	} else {
		return [];
	}
}

export * from "./constants";
export * from "./gateway";
export * from "./range";
export * from "./router";
export * from "./routing";
