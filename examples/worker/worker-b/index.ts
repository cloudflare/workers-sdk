import { WorkerEntrypoint } from 'cloudflare:workers';

export default class extends WorkerEntrypoint<Env> {
	override fetch(request: Request) {
		return Response.json({ name: 'Worker B' });
	}
	add(a: number, b: number) {
		return a + b;
	}
}

export class NamedEntrypoint extends WorkerEntrypoint<Env> {
	multiply(a: number, b: number) {
		return a * b;
	}
}
