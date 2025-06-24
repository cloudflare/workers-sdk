/**
/**
 * @returns {import('vite').Plugin}
 */
export default function testDepPlugin() {
	return {
		name: "test-dep-plugin",
		resolveId(id) {
			if (id === "virtual:test-dep/internal") {
				return "\0" + id;
			}
		},
		load(id) {
			if (id === "\0virtual:test-dep/internal") {
				return 'export default "ok"';
			}
		},
	};
}
