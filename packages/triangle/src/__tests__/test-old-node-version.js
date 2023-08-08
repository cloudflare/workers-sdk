// this test has to be run with a version of Node.js older than 16.13 to pass

const { spawn } = require("child_process");
const path = require("path");

const assert = require("assert");

const triangleProcess = spawn(
	"node",
	[path.join(__dirname, "../../bin/triangle.js")],
	{ stdio: "pipe" }
);

const messageToMatch = "Triangle requires at least Node.js v16.13.0";

triangleProcess.once("exit", (code) => {
	try {
		const errorMessage = triangleProcess.stderr.read().toString();

		assert(code === 1, "Expected exit code 1");
		assert(
			errorMessage.includes(messageToMatch),
			`Expected error message to include "${messageToMatch}"`
		);
	} catch (err) {
		console.error("Error:", err);
		throw new Error(
			"This test has to be run with a version of Node.js under 16.13 to pass"
		);
	}
});
