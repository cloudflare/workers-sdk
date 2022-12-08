import fs from "node:fs";
import { E2E_TMP_PATH, getRootTmp } from "./setup";

export default function (): void {
	// Delete temporary directory containing wrangler installation and scripts
	const tmp = getRootTmp();
	console.log(`---> Deleting ${tmp}...`);
	fs.rmSync(E2E_TMP_PATH);
	fs.rmSync(tmp, { recursive: true, force: true });
}
