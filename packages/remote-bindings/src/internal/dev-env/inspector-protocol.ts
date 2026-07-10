import type { DevToolsEvent } from "./devtools";
import type Protocol from "devtools-protocol/types/protocol-mapping";

type Params<ParamsArray extends [unknown?]> = ParamsArray extends [infer P]
	? P
	: undefined;

export type DevToolsEvents = DevToolsEvent<keyof Protocol.Events>;

type CommandMethods = keyof Protocol.Commands;
export type DevToolsCommandRequest<Method extends CommandMethods> =
	Method extends unknown
		? Params<Protocol.Commands[Method]["paramsType"]> extends undefined
			? { id: number; method: Method }
			: {
					id: number;
					method: Method;
					params: Params<Protocol.Commands[Method]["paramsType"]>;
				}
		: never;

export type DevToolsCommandRequests = DevToolsCommandRequest<CommandMethods>;

export type DevToolsCommandResponse<Method extends CommandMethods> =
	Method extends unknown
		? { id: number; result: Protocol.Commands[Method]["returnType"] }
		: never;
export type DevToolsCommandResponses = DevToolsCommandResponse<CommandMethods>;
