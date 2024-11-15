// import { getEnv } from "../../../packages/mixed-mode/lib/get-env";

export class MyDurableObject {}

interface Env {
	// MY_DO: DurableObjectNamespace;
	TODOS: KVNamespace;
}

//
export default {
	async fetch(request, env): Promise<Response> {
		// 	MY_DO: DurableObjectNamespace;
		// 	TODOS: KVNamespace;
		// }>(_env, ["MY_DO", "TODOS"]);
		// const id = env.MY_DO.idFromName("/pathname");

		// const stub = env.MY_DO.get(id);
		// // console.log('stub', await stub);

		// // console.log('stub', stub);
		// const n = await stub.add(1, 2);
		// console.log(n);
		// const counter = await stub.newOtherCounter();
		// // await f(2); // returns 2
		// // await f(1); // returns 3
		// // const count = await f(-5); // returns -2
		// // console.log(counter.increment(2)[ChainSymbol]);

		// await counter.increment(2); // returns 2
		// await counter.increment(1); // returns 3
		// // await counter.increment(-5); // returns -2

		// const count = await counter.value; // returns -2

		// return new Response(count);

		// const obj = await env.TODOS.put("hello", "world");

		const object = await env.TODOS.get("hello");

		console.log(object);

		// if (object === null) {
		// 	return new Response('Object Not Found', { status: 404 });
		// }

		return new Response(object);
	},
} satisfies ExportedHandler<Env>;
