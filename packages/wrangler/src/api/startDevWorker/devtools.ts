import type Protocol from "devtools-protocol/types/protocol-mapping";

type _Params<ParamsArray extends [unknown?]> = ParamsArray extends [infer P]
	? P
	: undefined;

type _EventMethods = keyof Protocol.Events;
export type DevToolsEvent<Method extends _EventMethods> = Method extends unknown
	? {
			method: Method;
			params: _Params<Protocol.Events[Method]>;
	  }
	: never;

export type DevToolsEvents = DevToolsEvent<_EventMethods>;

type _CommandMethods = keyof Protocol.Commands;
export type DevToolsCommandRequest<Method extends _CommandMethods> =
	Method extends unknown
		? _Params<Protocol.Commands[Method]["paramsType"]> extends undefined
			? {
					id: number;
					method: Method;
			  }
			: {
					id: number;
					method: Method;
					params: _Params<Protocol.Commands[Method]["paramsType"]>;
			  }
		: never;

export type DevToolsCommandRequests = DevToolsCommandRequest<_CommandMethods>;

export type DevToolsCommandResponse<Method extends _CommandMethods> =
	Method extends unknown
		? {
				id: number;
				result: Protocol.Commands[Method]["returnType"];
		  }
		: never;
export type DevToolsCommandResponses = DevToolsCommandResponse<_CommandMethods>;
