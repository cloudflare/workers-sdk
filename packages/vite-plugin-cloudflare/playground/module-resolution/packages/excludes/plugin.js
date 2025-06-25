const testId = "virtual:test-dep/internal";

export default function testDepPlugin() {
	return {
		name: "test-dep-plugin",
		resolveId(id) {
			if (id === testId) {
				return `\0${testId}`;
			}
		},
		load(id) {
			if (id === `\0${testId}`) {
				return 'export default "ok"';
			}
		},
	};
}
