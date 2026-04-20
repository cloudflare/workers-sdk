interface Env {
	CF_WORKER_ZONE: string;
}

export default {
	fetch(request, env: Env) {
		const headers = new Headers(request.headers);
		headers.delete("CF-Connecting-IP");
		headers.set("CF-Worker", env.CF_WORKER_ZONE);
		return fetch(request, { headers });
	},
} satisfies ExportedHandler<Env>;
