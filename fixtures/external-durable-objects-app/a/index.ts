export default {
	fetch(request: Request, env: { MY_DO: DurableObjectNamespace }) {
		const { pathname } = new URL(request.url);
		const id = env.MY_DO.idFromName(pathname);
		const stub = env.MY_DO.get(id);
		return stub.fetch(request);
	},
};

export class MyDurableObject implements DurableObject {
	constructor(public state: DurableObjectState) {}

	async fetch(request: Request) {
		if (request.headers.has("X-Reset-Count")) {
			await this.state.storage.put("count", 0);
		}
		let count: number = (await this.state.storage.get("count")) || 0;
		await this.state.storage.put("count", ++count);
		return Response.json({ count, id: this.state.id.toString() });
	}
}
