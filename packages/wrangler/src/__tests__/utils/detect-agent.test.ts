import { detectAgenticEnvironment } from "am-i-vibing";
import { beforeEach, describe, it, vi } from "vitest";
import { getDetectedAgentId, isAgenticAgent } from "../../utils/detect-agent";

vi.mock("am-i-vibing");

describe("detect-agent", () => {
	beforeEach(() => {
		vi.mocked(detectAgenticEnvironment).mockReset();
	});

	describe("isAgenticAgent()", () => {
		it("returns true when detection type is 'agent'", ({ expect }) => {
			vi.mocked(detectAgenticEnvironment).mockReturnValue({
				isAgentic: true,
				id: "claude-code",
				name: "Claude Code",
				type: "agent",
			});

			expect(isAgenticAgent()).toBe(true);
		});

		it("returns false when type is 'hybrid'", ({ expect }) => {
			vi.mocked(detectAgenticEnvironment).mockReturnValue({
				isAgentic: true,
				id: "warp",
				name: "Warp",
				type: "hybrid",
			});

			expect(isAgenticAgent()).toBe(false);
		});

		it("returns false when type is 'interactive'", ({ expect }) => {
			vi.mocked(detectAgenticEnvironment).mockReturnValue({
				isAgentic: false,
				id: null,
				name: null,
				type: "interactive",
			});

			expect(isAgenticAgent()).toBe(false);
		});

		it("returns false when detectAgenticEnvironment throws", ({ expect }) => {
			vi.mocked(detectAgenticEnvironment).mockImplementation(() => {
				throw new Error("boom");
			});

			expect(isAgenticAgent()).toBe(false);
		});
	});

	describe("getDetectedAgentId()", () => {
		it("returns the id when detection succeeds", ({ expect }) => {
			vi.mocked(detectAgenticEnvironment).mockReturnValue({
				isAgentic: true,
				id: "claude-code",
				name: "Claude Code",
				type: "agent",
			});

			expect(getDetectedAgentId()).toBe("claude-code");
		});

		it("returns null when detection throws", ({ expect }) => {
			vi.mocked(detectAgenticEnvironment).mockImplementation(() => {
				throw new Error("boom");
			});

			expect(getDetectedAgentId()).toBe(null);
		});
	});
});
