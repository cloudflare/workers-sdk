import { DeferredPromise } from "./lib/deferred-promise";
import {
	bufferedStringify,
	ChainItem,
	createCloudflareReducers,
	createCloudflareRevivers,
	createHTTPReducers,
	createHTTPRevivers,
	parseBufferedStreams,
	ReducersRevivers,
	structuredSerializableReducers,
	structuredSerializableRevivers,
	UnresolvedChain,
} from "./lib/devalue";

const ChainSymbol = Symbol.for("chain");

// send: to client
// receive: from client
export class RpcServer {
	heap: Map<string, unknown>;

	constructor(
		private send: (data: string) => void,
		private expose: Record<string, unknown>
	) {
		this.heap = new Map();
	}

	async receive(data: string) {
		const reducers: ReducersRevivers = {
			...structuredSerializableReducers,
			...createHTTPReducers(),
			...createCloudflareReducers(this.heap),
		};
		const revivers: ReducersRevivers = {
			...structuredSerializableRevivers,
			...createHTTPRevivers(),
			...createCloudflareRevivers(this.heap),
		};
		const methodId = data.slice(0, 36);
		const { chain, targetHeapId } = await parseBufferedStreams<{
			chain: ChainItem[];
			targetHeapId: string;
		}>(data.slice(36), revivers);
		console.log({ chain });

		let startingObject;
		if (targetHeapId) {
			startingObject = this.heap.get(targetHeapId);
		} else {
			startingObject = this.expose;
		}

		try {
			const result = await this.resolveChain(startingObject, chain);
			this.send(
				methodId + (await bufferedStringify({ data: result }, reducers))
			);
		} catch (e) {
			this.send(methodId + (await bufferedStringify({ error: e }, reducers)));
		}
	}

	async resolveChain(target: any, chain: ChainItem[]) {
		let result = target;
		for (const item of chain) {
			console.log("resolving", item);
			if (item.type === "get") {
				let prop = result[item.property];

				if (
					prop?.constructor.name === "RpcProperty" ||
					typeof prop !== "function"
				) {
					console.log("prop", item);

					result = prop;
				} else {
					console.log("fn", item);

					result = prop.bind(result);
				}
			} else if (item.type === "apply") {
				console.log("apply", typeof item);

				result = await Reflect.apply(
					result,
					result,
					await Promise.all(
						item.arguments.map((a: any) =>
							a instanceof UnresolvedChain
								? this.resolveChain(
										a.chainProxy.targetHeapId
											? this.heap.get(a.chainProxy.targetHeapId)
											: target,
										a.chainProxy.chain
									)
								: a
						)
					)
				);
				console.log("res", typeof (await result));
			}
		}
		const returnable = await result;
		if (returnable?.constructor.name === "RpcStub") {
			const id = crypto.randomUUID();
			this.heap.set(id, returnable);
			return new UnresolvedChain({ chain: [], targetHeapId: id });
		}
		return await result;
	}
}

// send: to server
// receive: from server
export class RpcClient {
	pendingMessages: Map<string, DeferredPromise<string>> = new Map();

	constructor(private send: (data: string) => void) {}

	receive(data: string) {
		const methodId = data.slice(0, 36);
		const promise = this.pendingMessages.get(methodId);
		promise?.resolve(data.slice(36));
	}

	createChainProxy<T>(
		chain: ChainItem[] = [],
		targetHeapId: unknown = undefined,
		thenable = true
	): T {
		const reducers: ReducersRevivers = {
			...structuredSerializableReducers,
			...createHTTPReducers(),
			...createCloudflareReducers(),
		};
		const revivers: ReducersRevivers = {
			...structuredSerializableRevivers,
			...createHTTPRevivers(),
			...createCloudflareRevivers(undefined, (id) =>
				this.createChainProxy([], id, false)
			),
		};
		return new Proxy(function () {}, {
			get: (_, p) => {
				if (p === ChainSymbol) {
					return { chain, targetHeapId };
				}
				if (p === "then" && !thenable) {
					return undefined;
				}
				return this.createChainProxy(
					[...chain, { type: "get", property: p }],
					targetHeapId
				);
			},
			apply: (_target, _thisArg, argumentsList) => {
				const prev = chain[chain.length - 1];
				if (prev?.type === "get" && prev?.property === "then") {
					(async () => {
						try {
							const messageId = crypto.randomUUID();
							const string = await bufferedStringify(
								{
									chain: chain.slice(0, -1),
									targetHeapId,
								},
								reducers
							);
							const promise = new DeferredPromise<string>();
							this.pendingMessages.set(messageId, promise);

							this.send(messageId + string);

							const { data, error } = parseBufferedStreams<{
								data: unknown;
								error: unknown;
							}>(await promise, revivers);

							if (error) {
								argumentsList[1](error);
							} else {
								argumentsList[0](data);
							}
						} catch (e) {
							argumentsList[1](e);
						}
					})();
				} else {
					return this.createChainProxy(
						[
							...chain,
							{
								type: "apply",
								arguments: argumentsList.map((a) =>
									!!a[ChainSymbol]
										? new UnresolvedChain({
												chain: a[ChainSymbol].chain,
												targetHeapId: a[ChainSymbol].targetHeapId,
											})
										: a
								),
							},
						],
						targetHeapId
					);
				}
			},
		}) as T;
	}
}
