import {
	ChainItem,
	createCloudflareReducers,
	createCloudflareRevivers,
	parse,
	ReducersRevivers,
	serialiseToRequest,
	serialiseToResponse,
	UnresolvedChain,
	WORKERS_PLATFORM_IMPL,
} from "./lib/devalue";
import {
	createHTTPReducers,
	createHTTPRevivers,
	structuredSerializableReducers,
	structuredSerializableRevivers,
} from "./lib/miniflare";

const ChainSymbol = Symbol.for("chain");

/**
 * RpcServer is the server side of an RPC connection with RpcClient
 * It's implemented to be transport agnostic, and just defines a `request()`
 * which should be called whenever the client sends a request
 */
export class RpcServer {
	/**
	 * Sometimes we need to keep things around on the server-side in case the client requests them again
	 * e.g. an RpcStub that the client still has a reference to
	 */
	heap: Map<string, unknown>;

	constructor(/* the object to be exposed over RPC */ private expose: unknown) {
		this.heap = new Map();
	}

	async request(request: Request): Promise<Response> {
		const reducers: ReducersRevivers = {
			...structuredSerializableReducers,
			...createHTTPReducers(WORKERS_PLATFORM_IMPL),
			...createCloudflareReducers(this.heap),
		};
		const revivers: ReducersRevivers = {
			...structuredSerializableRevivers,
			...createHTTPRevivers(WORKERS_PLATFORM_IMPL),
			...createCloudflareRevivers(this.heap),
		};
		/**
		 * `chain` is the sequence of operations that client performed that should be replayed on the target
		 * `targetHeapId` is _which_ target to replay the operations on. On a first request this will likely
		 * be undefined, and so the chain should be replayed directly on `this.expose`
		 */
		const { chain, targetHeapId } = await parse<{
			chain: ChainItem[];
			targetHeapId: string | undefined;
		}>(request, revivers);

		try {
			const result = await this.resolveChain(
				targetHeapId ? this.heap.get(targetHeapId) : this.expose,
				chain
			);
			return serialiseToResponse({ data: result }, reducers);
		} catch (e) {
			// Sometimes bindings can throw errors. We catch and serialise those, so they can be re-thrown on the client
			return serialiseToResponse({ error: e }, reducers);
		}
	}

	/**
	 * Replay a `chain` of operations on a given `target`
	 */
	private async resolveChain(target: any, chain: ChainItem[]) {
		let result = target;
		for (const item of chain) {
			if (item.type === "get") {
				// If the client operation was a property access
				let prop = result[item.property];

				if (
					prop?.constructor.name === "RpcProperty" ||
					typeof prop !== "function"
				) {
					// If the value is not a function, it can be used directly
					// Note the special casing for `RpcProperty`, since typeof RpcProperty === "function"
					result = prop;
				} else {
					// If the value is a function, bind it to the previous `result` to preserve `this` references
					result = prop.bind(result);
				}
			} else if (item.type === "apply") {
				// If the client operation was a function call
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

/**
 * RpcClient is the client side of an RPC connection with RpcServer
 * It's implemented to be transport agnostic, and just takes a `request()` method in the constructor
 * which it uses to send a request and receive a response from the server
 */
export class RpcClient {
	constructor(private request: (data: Request) => Promise<Response>) {}

	createChainProxy<T>(
		chain: ChainItem[] = [],
		targetHeapId: unknown = undefined,
		thenable = true
	): T {
		const reducers: ReducersRevivers = {
			...structuredSerializableReducers,
			...createHTTPReducers(WORKERS_PLATFORM_IMPL),
			...createCloudflareReducers(),
		};
		const revivers: ReducersRevivers = {
			...structuredSerializableRevivers,
			...createHTTPRevivers(WORKERS_PLATFORM_IMPL),
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
							const req = await serialiseToRequest(
								{
									chain: chain.slice(0, -1),
									targetHeapId,
								},
								reducers
							);

							const result = await this.request(req);

							const { data, error } = await parse<{ data: any; error: Error }>(
								result,
								revivers
							);

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
