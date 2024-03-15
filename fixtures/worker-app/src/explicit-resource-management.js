/** @param {string[]} logs */
function connect(logs) {
	logs.push("Connected");
	return {
		send(message) {
			logs.push(`Sent ${message}`);
		},
		[Symbol.dispose]() {
			logs.push("Disconnected synchronously");
		},
		async [Symbol.asyncDispose]() {
			logs.push("Disconnected asynchronously");
		},
	};
}

/** @param {string[]} logs */
export async function testExplicitResourceManagement(logs) {
	using syncConnect = connect(logs);
		await using asyncConnect = connect(logs);

	syncConnect.send("hello");
	asyncConnect.send("goodbye");
}
