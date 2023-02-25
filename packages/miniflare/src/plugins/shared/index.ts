import { z } from "zod";
import { Service, Worker_Binding, Worker_Module } from "../../runtime";
import { Awaitable, Log, OptionalZodTypeOf } from "../../shared";
import { GatewayConstructor, RemoteStorageConstructor } from "./gateway";
import { RouterConstructor } from "./router";

export type DurableObjectClassNames = Map<string, Set<string>>;

export interface PluginServicesOptions<
	Options extends z.ZodType,
	SharedOptions extends z.ZodType | undefined,
> {
	log: Log;
	options: z.infer<Options>;
	sharedOptions: OptionalZodTypeOf<SharedOptions>;
	workerBindings: Worker_Binding[];
	workerIndex: number;
	durableObjectClassNames: DurableObjectClassNames;
	additionalModules: Worker_Module[];
	tmpPath: string;
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
		? { gateway?: undefined; router?: undefined; remoteStorage?: undefined }
		: {
				gateway: GatewayConstructor<Gateway>;
				router: RouterConstructor<Gateway>;
				remoteStorage?: RemoteStorageConstructor;
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
