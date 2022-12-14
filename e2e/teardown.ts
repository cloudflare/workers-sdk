import fs from "node:fs";
import { E2E_TMP_PATH, getRootTmp } from "./setup";

// Global teardown function, called by Jest once after running E2E tests
export default function (): void {
	// Delete temporary directory containing wrangler installation and scripts
	const tmp = getRootTmp();
	console.log(`---> Deleting ${tmp}...`);
	fs.rmSync(E2E_TMP_PATH);
	fs.rmSync(tmp, { recursive: true, force: true });
}
