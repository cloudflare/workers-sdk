import { ChildProcess, exec, spawn } from "child_process";
import { fetch } from "undici";

const RUNNING_PROCESSES: ChildProcess[] = [];

describe("Remix", () => {
  beforeAll(async () => {
    RUNNING_PROCESSES.push(spawn("npm run dev:remix", { shell: true }));
    RUNNING_PROCESSES.push(spawn("npm run dev:wrangler", { shell: true }));
  });

  afterAll(() => {
    RUNNING_PROCESSES.forEach((runningProcess) => {
      runningProcess.kill();
    });
  });

  it("renders", async () => {
    const response = await fetch("http://localhost:8788/");
    const text = await response.text();
    expect(text).toContain("Welcome to Remix");
  });
});
