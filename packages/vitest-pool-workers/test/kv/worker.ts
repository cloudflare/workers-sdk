export class Counter implements DurableObject {
	alarmResolve: (value: number) => void;
	alarmPromise: Promise<number>;

	instanceId = crypto.randomUUID();

	constructor(readonly state: DurableObjectState) {
		let alarmResolve: (value: number) => void;
		this.alarmPromise = new Promise<number>(
			(resolve) => (alarmResolve = resolve)
		);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.alarmResolve = alarmResolve!;
	}

	async fetch(request: Request): Promise<Response> {
		const { pathname } = new URL(request.url);
		const value = ((await this.state.storage.get<number>(pathname)) ?? 0) + 1;
		void this.state.storage.put(pathname, value);
		return Response.json({
			objectId: this.state.id.toString(),
			instanceId: this.instanceId,
			value,
		});
	}

	async alarm() {
		this.alarmResolve(42);
	}
}

export function transformResponse(response: Response): Response {
	return new HTMLRewriter()
		.on("a", {
			element(element) {
				const href = element.getAttribute("href");
				if (href !== null) {
					element.setAttribute("href", href.replace("http://", "https://"));
				}
			},
		})
		.transform(response);
}

// TODO(soon): once we upgrade to TypeScript 5/Prettier 3, replace this with
//  `satisfies ExportedHandler<Env>` so we don't need non-null assertions on
//  the `fetch()` method
export default <ExportedHandler<Env>>{
	async fetch(request, _env, _ctx) {
		return new Response(`body:${request.url}`);
	},
};
