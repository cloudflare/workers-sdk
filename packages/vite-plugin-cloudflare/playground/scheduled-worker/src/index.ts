export default {
	async scheduled(...args) {
		console.log("__console log__");
		console.warn("__console warn__");
		console.error("__console error__");
		args[2].waitUntil(
			new Promise<void>((resolve) => {
				console.log("__wait until__");
				resolve();
			})
		);
	},
} satisfies ExportedHandler;