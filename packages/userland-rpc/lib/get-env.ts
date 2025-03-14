import {
	ChainItem,
	createCloudflareReducers,
	createCloudflareRevivers,
	createHTTPReducers,
	createHTTPRevivers,
	fromStream,
	ReducersRevivers,
	structuredSerializableReducers,
	structuredSerializableRevivers,
	toStream,
	UnresolvedChain,
} from "./devalue";

const ChainSymbol = Symbol.for("chain");

const ChainProxy: any = (
	endpoint: string,
	bindingName: string,
	chain: ChainItem[] = [],
	targetHeapId: unknown = undefined,
	thenable = true
) => {
	return new Proxy(function () {}, {
		get(_, p) {
			if (p === ChainSymbol) {
				return { chain, targetHeapId };
			}
			if (p === "then" && !thenable) {
				return undefined;
			}
			return ChainProxy(
				endpoint,
				bindingName,
				[...chain, { type: "get", property: p }],
				targetHeapId
			);
		},
		apply(_target, _thisArg, argumentsList) {
			const prev = chain[chain.length - 1];
			if (prev?.type === "get" && prev?.property === "then") {
				(async () => {
					try {
						const [body, headers] = await toStream(
							{ chain: chain.slice(0, -1), targetHeapId, bindingName },
							reducers
						);
						const r = await fetch(endpoint, {
							method: "POST",
							headers: {
								"X-Token": "ajofuviueqrgo8iquehisadcvsdivcbiu",
								...headers,
							},
							body,
						});
						const { data, error } = await fromStream<{
							data: unknown;
							error: unknown;
						}>(r, revivers);

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
				return ChainProxy(
					endpoint,
					bindingName,
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
	});
};

const reducers: ReducersRevivers = {
	...structuredSerializableReducers,
	...createHTTPReducers(),
	...createCloudflareReducers(),
};
const revivers: ReducersRevivers = {
	...structuredSerializableRevivers,
	...createHTTPRevivers(),
	...createCloudflareRevivers(undefined, (id) =>
		ChainProxy("http://localhost:8787", "", [], id, false)
	),
};

export function getEnv<Env extends { [binding: string]: unknown }>(
	env: Env,
	remote: string[]
): Env {
	for (const binding of remote) {
		Object.assign(env, {
			[binding]: ChainProxy(env.MIXED_MODE_SETTINGS?.url, binding),
		});
	}
	return env;
}
