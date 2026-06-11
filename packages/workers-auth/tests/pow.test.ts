import { createHash } from "node:crypto";
import { describe, it } from "vitest";
import { solveChallenge } from "../src/pow";

const CHECKPOINT_BYTES = 32;

function sha256(input: Buffer): Buffer {
	return createHash("sha256").update(input).digest();
}

describe("proof-of-work solver", () => {
	it("produces a contiguous checkpoint ladder anchored at the seed", ({
		expect,
	}) => {
		const seed = Buffer.alloc(32, 7);
		const k = 4;
		const g = 5;

		const { solution } = solveChallenge({
			challengeToken: "token",
			seed: seed.toString("base64url"),
			k,
			g,
		});

		const flat = Buffer.from(solution.checkpoints, "base64");
		expect(flat.length).toBe((k + 1) * CHECKPOINT_BYTES);

		const checkpoints: Buffer[] = [];
		for (let i = 0; i <= k; i++) {
			checkpoints.push(
				flat.subarray(i * CHECKPOINT_BYTES, (i + 1) * CHECKPOINT_BYTES)
			);
		}

		// C[0] == SHA256(seed), and each segment chains g hashes into the next
		// checkpoint — the same relation the worker verifier spot-checks.
		expect(checkpoints[0].equals(sha256(seed))).toBe(true);
		for (let j = 0; j < k; j++) {
			let h = checkpoints[j];
			for (let i = 0; i < g; i++) {
				h = sha256(h);
			}
			expect(h.equals(checkpoints[j + 1])).toBe(true);
		}
	});

	it("passes the challenge token through unchanged", ({ expect }) => {
		const { challengeToken } = solveChallenge({
			challengeToken: "abc.def",
			seed: Buffer.alloc(32).toString("base64url"),
			k: 1,
			g: 1,
		});
		expect(challengeToken).toBe("abc.def");
	});
});
