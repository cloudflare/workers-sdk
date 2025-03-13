import assert from "node:assert";

export default {
	async fetch() {
		return testProcessBehaviour();
	},
} satisfies ExportedHandler;

function testProcessBehaviour() {
	try {
		assert(process.env.FOO == "foo value", "process.env.FOO not populated");

		assert(process.env.BAR == "bar secret", "process.env.BAR not populated");
	} catch (e) {
		if (e instanceof Error) {
			return new Response(`${e.stack}`, { status: 500 });
		} else {
			throw e;
		}
	}

	return new Response("OK!");
}
