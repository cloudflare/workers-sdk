import assert from "node:assert";

export default {
	async fetch() {
		return testProcessBehaviour();
	},
} satisfies ExportedHandler;

function testProcessBehaviour() {
	const originalProcess = process;
	try {
		assert(process !== undefined, "process is missing");
		assert(globalThis.process !== undefined, "globalThis.process is missing");
		assert(global.process !== undefined, "global.process is missing");
		assert(
			process === global.process,
			"process is not the same as global.process"
		);
		assert(
			global.process === globalThis.process,
			"global.process is not the same as globalThis.process"
		);
		assert(
			globalThis.process === process,
			"globalThis.process is not the same as process"
		);

		const fakeProcess1 = {} as typeof process;
		process = fakeProcess1;
		assert(process === fakeProcess1, "process is not updated to fakeProcess");
		assert(
			global.process === fakeProcess1,
			"global.process is not updated to fakeProcess"
		);
		assert(
			globalThis.process === fakeProcess1,
			"globalThis.process is not updated to fakeProcess"
		);

		const fakeProcess2 = {} as typeof process;
		global.process = fakeProcess2;
		assert(process === fakeProcess2, "process is not updated to fakeProcess");
		assert(
			global.process === fakeProcess2,
			"global.process is not updated to fakeProcess"
		);
		assert(
			globalThis.process === fakeProcess2,
			"globalThis.process is not updated to fakeProcess"
		);

		const fakeProcess3 = {} as typeof process;
		globalThis.process = fakeProcess3;
		assert(process === fakeProcess3, "process is not updated to fakeProcess");
		assert(
			global.process === fakeProcess3,
			"global.process is not updated to fakeProcess"
		);
		assert(
			globalThis.process === fakeProcess3,
			"globalThis.process is not updated to fakeProcess"
		);

		const fakeProcess4 = {} as typeof process;
		globalThis["process"] = fakeProcess4;
		assert(process === fakeProcess4, "process is not updated to fakeProcess");
		assert(
			global.process === fakeProcess4,
			"global.process is not updated to fakeProcess"
		);
		assert(
			globalThis.process === fakeProcess4,
			"globalThis.process is not updated to fakeProcess"
		);
	} catch (e) {
		if (e instanceof Error) {
			return new Response(`${e.stack}`, { status: 500 });
		} else {
			throw e;
		}
	} finally {
		process = originalProcess;
	}

	return new Response("OK!");
}
