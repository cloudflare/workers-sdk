import { z } from "zod";
import { Service, Worker_Binding, Worker_Module } from "../../runtime";
import { Awaitable, OptionalZodTypeOf } from "../../shared";
import { GatewayConstructor } from "./gateway";
import { RouterConstructor } from "./router";

export type DurableObjectClassNames = Map<string, string[]>;

export interface PluginServicesOptions<
	Options extends z.ZodType,
	SharedOptions extends z.ZodType | undefined,
> {
	options: z.infer<Options>;
	optionsVersion: number;
	sharedOptions: OptionalZodTypeOf<SharedOptions>;
	workerBindings: Worker_Binding[];
	workerIndex: number;
	durableObjectClassNames: DurableObjectClassNames;
	additionalModules: Worker_Module[];
}

export interface PluginBase<
	Options extends z.ZodType,
	SharedOptions extends z.ZodType | undefined,
> {
	options: Options;
	getBindings(options: z.infer<Options>): Awaitable<Worker_Binding[] | void>;
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

export * from "./constants";
export * from "./gateway";
export * from "./router";
