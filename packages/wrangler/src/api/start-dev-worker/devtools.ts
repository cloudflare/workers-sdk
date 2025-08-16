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
