import { beforeEach, describe, it, vi } from "vitest";
import { detectAgent } from "../../utils/detect-agent";

// Undo the global no-op mock from vitest.setup.ts so we test the real implementation
vi.unmock("../../utils/detect-agent");

const mockDetectAgenticEnvironment = vi.hoisted(() => vi.fn());

vi.mock("am-i-vibing", () => ({
	detectAgenticEnvironment: mockDetectAgenticEnvironment,
}));

describe("detect-agent", () => {
	beforeEach(() => {
		mockDetectAgenticEnvironment.mockReset();
	});

	describe("detectAgent()", () => {
		it("reports an agent (with id) when detection type is 'agent'", ({
			expect,
		}) => {
			mockDetectAgenticEnvironment.mockReturnValue({
				isAgentic: true,
				id: "claude-code",
				name: "Claude Code",
				type: "agent",
			});

			expect(detectAgent()).toEqual({ isAgent: true, id: "claude-code" });
		});

		it("is not an agent when type is 'hybrid', but still reports the id", ({
			expect,
		}) => {
			mockDetectAgenticEnvironment.mockReturnValue({
				isAgentic: true,
				id: "warp",
				name: "Warp",
				type: "hybrid",
			});

			expect(detectAgent()).toEqual({ isAgent: false, id: "warp" });
		});

		it("is not an agent when type is 'interactive'", ({ expect }) => {
			mockDetectAgenticEnvironment.mockReturnValue({
				isAgentic: false,
				id: null,
				name: null,
				type: "interactive",
			});

			expect(detectAgent()).toEqual({ isAgent: false, id: null });
		});

		it("resolves to a non-agent result when detection throws", ({ expect }) => {
			mockDetectAgenticEnvironment.mockImplementation(() => {
				throw new Error("boom");
			});

			expect(detectAgent()).toEqual({ isAgent: false, id: null });
		});

		it("detects in a single pass", ({ expect }) => {
			mockDetectAgenticEnvironment.mockReturnValue({
				isAgentic: true,
				id: "claude-code",
				name: "Claude Code",
				type: "agent",
			});

			detectAgent();

			expect(mockDetectAgenticEnvironment).toHaveBeenCalledTimes(1);
		});
	});
});
