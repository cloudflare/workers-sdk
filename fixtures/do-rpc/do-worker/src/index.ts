import { DurableObject, RpcTarget, WorkerEntrypoint } from "cloudflare:workers";

export class MyDurableObject extends DurableObject {
	/**
	 * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
	 * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
	 *
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	/**
	 * The Durable Object exposes an RPC method sayHello which will be invoked when when a Durable
	 *  Object instance receives a request from a Worker via the same method invocation on the stub
	 *
	 * @param name - The name provided to a Durable Object instance from a Worker
	 * @returns The greeting to be sent back to the Worker
	 */
	async sayHello(name: string): Promise<string> {
		return `Hello, ${name}!`;
	}
}

interface Env {
	USER_DO: DurableObjectNamespace<MyDurableObject>;
}

export class MockDurableObjectEntrypoint extends WorkerEntrypoint<Env> {
	idFromName(...args) {
		console.log("idFromName", { args });
		return new DOSyncResult("idFromName", args);
	}

	get(...args) {
		const syncResult = new DOSyncResult("get", args);
		console.log("get", { args });
		const stub = syncResult.resolve(this.env.USER_DO);

		return new ProxyDurableObjectStub(stub);
	}
}

class ProxyDurableObjectStub extends RpcTarget {
	constructor(protected stub: DurableObjectStub<MyDurableObject>) {
		super();
	}
}

for (const method of Object.keys(MyDurableObject.prototype)) {
	Object.defineProperty(
		ProxyDurableObjectStub.prototype,
		method,
		function (this: ProxyDurableObjectStub, ...args) {
			return this.stub[method](...args);
		}
	);
}

class DOSyncResult extends RpcTarget {
	constructor(
		public method: string,
		public args: unknown[]
	) {
		super();
	}

	resolve(binding) {
		const args = this.args.map((arg) =>
			arg instanceof DOSyncResult ? arg.resolve(binding) : arg
		);
		return binding[this.method](...args);
	}
}

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 *
	 * @param request - The request submitted to the Worker from the client
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 * @param ctx - The execution context of the Worker
	 * @returns The response to be sent back to the client
	 */
	async fetch(request, env, ctx): Promise<Response> {
		// We will create a `DurableObjectId` using the pathname from the Worker request
		// This id refers to a unique instance of our 'MyDurableObject' class above
		let id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName(
			new URL(request.url).pathname
		);

		// This stub creates a communication channel with the Durable Object instance
		// The Durable Object constructor will be invoked upon the first call for a given id
		let stub = env.MY_DURABLE_OBJECT.get(id);

		// We call the `sayHello()` RPC method on the stub to invoke the method on the remote
		// Durable Object instance
		let greeting = await stub.sayHello("world");

		return new Response(greeting);
	},
} satisfies ExportedHandler<Env>;
