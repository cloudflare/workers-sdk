import childProcess from "node:child_process";

interface Process {
	pid: string;
	cmd: string;
}

function getProcesses(): Process[] {
	return childProcess
		.execSync("ps -e | awk '{print $1,$4}'", { encoding: "utf8" })
		.trim()
		.split("\n")
		.map((line) => {
			const [pid, cmd] = line.split(" ");
			return { pid, cmd };
		});
}

function getProcessCwd(pid: string | number) {
	return childProcess
		.execSync(`lsof -p ${pid} | awk '$4=="cwd" {print $9}'`, {
			encoding: "utf8",
		})
		.trim();
}
export function getStartedWorkerdProcesses(cwd: string): Process[] {
	return getProcesses()
		.filter(({ cmd }) => cmd.includes("workerd"))
		.filter((c) => getProcessCwd(c.pid).includes(cwd));
}
