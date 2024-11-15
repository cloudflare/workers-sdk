import { DurableObject } from 'cloudflare:workers';
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
} from '../lib/devalue';

const heap = new Map();
const reducers: ReducersRevivers = {
	...structuredSerializableReducers,
	...createHTTPReducers(),
	...createCloudflareReducers(heap),
};
const revivers: ReducersRevivers = {
	...structuredSerializableRevivers,
	...createHTTPRevivers(),
	...createCloudflareRevivers(heap),
};

export class ProxySingleton extends DurableObject<Record<string, unknown>> {
	async fetch(request: Request) {
		if (!(request.headers.get('X-Token') === 'ajofuviueqrgo8iquehisadcvsdivcbiu')) {
			return new Response(null, { status: 401 });
		}

		const { chain, targetHeapId, bindingName } = await fromStream<{ chain: ChainItem[]; targetHeapId: string; bindingName: string }>(
			request,
			revivers,
		);
		console.log({ chain });

		let startingObject;
		if (targetHeapId) {
			startingObject = heap.get(targetHeapId);
		} else {
			startingObject = this.env[bindingName as keyof typeof this.env];
		}

		try {
			const result = await resolveChain(startingObject, chain);
			return await serialised({ data: result });
		} catch (e) {
			return serialised({ error: e });
		}
	}
}

async function serialised(data: unknown): Promise<Response> {
	const [body, headers] = await toStream(data, reducers);
	return new Response(body, { headers });
}

async function resolveChain(target: any, chain: ChainItem[]) {
	let result = target;
	for (const item of chain) {
		if (item.type === 'get') {
			let prop = result[item.property];

			if (prop?.constructor.name === 'RpcProperty') {
				result = prop;
			} else {
				console.log('prop', item.property, prop);
				result = prop.bind(result);
			}
		} else if (item.type === 'apply') {
			result = await Reflect.apply(
				result,
				result,
				await Promise.all(
					item.arguments.map((a: any) =>
						a instanceof UnresolvedChain
							? resolveChain(a.chainProxy.targetHeapId ? heap.get(a.chainProxy.targetHeapId) : target, a.chainProxy.chain)
							: a,
					),
				),
			);
		}
	}
	return await result;
}

export default {
	async fetch(
		request: Request,
		env: {
			SINGLETON: DurableObjectNamespace;
		},
	): Promise<Response> {
		const id = env.SINGLETON.idFromName('singleton');

		const stub = env.SINGLETON.get(id);
		return stub.fetch(request);
	},
};
