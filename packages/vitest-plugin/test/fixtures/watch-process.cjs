const childProcess = require("node:child_process");

// This live group leader outlasts the command's shell/pnpm parent. It alone can
// signal its group, so cleanup never treats a saved, reusable PGID as ownership.
let command;
let started = false;
let killingParent = false;
let stopping = false;

function stop() {
	stopping = true;
	process.kill(-process.pid, "SIGKILL");
}

function send(message) {
	if (!process.connected) return stop();
	process.send(message, (error) => {
		if (error) stop();
	});
}

process.on("disconnect", stop);
process.on("message", (message) => {
	if (message.type === "stop") return stop();
	if (message.type === "start" && !started) {
		started = true;
		// eslint-disable-next-line workers-sdk/no-unsafe-command-execution -- private test launcher; the parent supplies its existing watch command
		command = childProcess.spawn(message.command, {
			shell: true,
			stdio: "inherit",
		});
		command.on("error", (error) => {
			send({
				type: "command-error",
				name: error.name,
				message: error.message,
				code: error.code,
			});
		});
		command.once("exit", (code, signal) => {
			if (stopping) return;
			send({ type: "command-exit", code, signal });
			if (killingParent) {
				send({
					type:
						code === null && signal === "SIGKILL"
							? "parent-killed"
							: "parent-kill-error",
				});
			}
		});
	} else if (message.type === "kill-parent") {
		if (
			!command ||
			command.exitCode !== null ||
			command.signalCode !== null ||
			!command.kill("SIGKILL")
		) {
			send({ type: "parent-kill-error" });
		} else {
			killingParent = true;
		}
	}
});

send({ type: "ready" });
