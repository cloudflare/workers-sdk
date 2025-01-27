import User from "./user";

export default class EntryWorker extends User {
	async fetch(req) {
		// forwarding to router-worker
		// e.g. return this.env.router.fetch(request)
		return new Response("override");
	}
}

export * from "./user";
