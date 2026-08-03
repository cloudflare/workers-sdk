import { createHash } from "node:crypto";

export const POW_PROTOCOL_VERSION = 1;

// Upper bound on the total work (k*g hashes) we'll solve. Solve time is
// proportional to k*g, so bounding the product caps it regardless of how the
// server splits difficulty. The provisioning service tops out around k=8000,
// g=2000 (16M); this leaves headroom for a legitimate server-side bump while
// still bounding a buggy or hostile challenge to a finite solve.
export const POW_MAX_ITERATIONS = 64_000_000;

export interface PowChallenge {
	challengeToken: string;
	seed: string;
	k: number;
	g: number;
}

export interface PowSolution {
	challengeToken: string;
	solution: { checkpoints: string };
}

// Sequential SHA-256 chain (spec §5.2): h0 = SHA256(seed), then k segments of g
// hashes, recording a checkpoint at each segment boundary. Inherently
// sequential, so it can't be parallelised.
function solvePow(seed: Buffer, k: number, g: number): Buffer[] {
	const checkpoints: Buffer[] = new Array(k + 1);
	let h = createHash("sha256").update(seed).digest();
	checkpoints[0] = h;
	for (let j = 0; j < k; j++) {
		for (let i = 0; i < g; i++) {
			h = createHash("sha256").update(h).digest();
		}
		checkpoints[j + 1] = h;
	}
	return checkpoints;
}

// Standard base64 of the concatenated (k+1)*32 bytes, matching the worker
// verifier's decode.
function encodeCheckpoints(checkpoints: Buffer[]): string {
	return Buffer.concat(checkpoints).toString("base64");
}

export function solveChallenge(challenge: PowChallenge): PowSolution {
	const checkpoints = solvePow(
		Buffer.from(challenge.seed, "base64url"),
		challenge.k,
		challenge.g
	);
	return {
		challengeToken: challenge.challengeToken,
		solution: { checkpoints: encodeCheckpoints(checkpoints) },
	};
}
