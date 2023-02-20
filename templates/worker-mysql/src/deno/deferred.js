function deferred1() {
	let methods;
	let state = 'pending';
	const promise = new Promise((resolve, reject) => {
		methods = {
			async resolve(value) {
				await value;
				state = 'fulfilled';
				resolve(value);
			},
			reject(reason) {
				state = 'rejected';
				reject(reason);
			},
		};
	});
	Object.defineProperty(promise, 'state', {
		get: () => state,
	});
	return Object.assign(promise, methods);
}
export { deferred1 as deferred };
