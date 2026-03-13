function callable() {
	return function <
		This,
		Value extends (this: This, ...args: Array<unknown>) => unknown,
	>(value: Value, _context: ClassMethodDecoratorContext<This, Value>) {
		return value;
	};
}

class DecoratedWorker {
	@callable()
	async message() {
		return { message: "ok" };
	}
}

const worker = new DecoratedWorker();

export default {
	async fetch() {
		return Response.json(await worker.message());
	},
} satisfies ExportedHandler;
