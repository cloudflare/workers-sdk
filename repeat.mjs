import { execSync } from "child_process";

for (const n of Array.from({ length: 100 })) {
	execSync("pnpm exec vitest run", { shell: true, stdio: "inherit" });
}
