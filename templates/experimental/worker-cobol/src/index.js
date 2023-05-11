import EM from '../build/out.js';

export default {
	/** @param {Request} request */
	async fetch(request) {
		globalThis.response = {
			status: 200,
			body: '',
		};

		const load = new Promise((resolve, reject) => {
			EM({
				instantiateWasm(info, receive) {
					let instance = new WebAssembly.Instance(WASM_MODULE, info);
					receive(instance);
					return instance.exports;
				},
			}).then(module => {
				delete module.then;
				resolve(module);
			});
		});

		try {
			const instance = await load;
			try {
				instance._entry();
			} catch (e) {
				// emscripten throws an exception when the program terminates, even with 0
				if (e.name !== 'ExitStatus') {
					throw e;
				}
			}

			return new Response(globalThis.response.body, {
				status: globalThis.response.status,
			});
		} catch (e) {
			console.log(e);
			return new Response(e.stack, { status: 500 });
		}
	},
};
