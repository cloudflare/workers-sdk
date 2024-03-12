export class Counter implements DurableObject {
	count: number = 0;

	constructor(readonly state: DurableObjectState) {
		void state.blockConcurrencyWhile(async () => {
			this.count = (await state.storage.get("count")) ?? 0;
		});
	}

	increment(by = 1) {
		this.count += by;
		void this.state.storage.put("count", this.count);
	}

	fetch(request: Request) {
		this.increment();
		return new Response(this.count.toString());
	}

	alarm() {
		this.count = 0;
		void this.state.storage.put("count", this.count);
	}

	scheduleReset(afterMillis: number) {
		void this.state.storage.setAlarm(Date.now() + afterMillis);
	}
}

export default <ExportedHandler<Env>>{
	fetch(request, env) {
		const { pathname } = new URL(request.url);
		const id = env.COUNTER.idFromName(pathname);
		const stub = env.COUNTER.get(id);
		return stub.fetch(request);
	},
};
