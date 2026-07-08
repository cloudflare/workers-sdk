import { detectAgenticEnvironment } from "am-i-vibing";
import { beforeEach, describe, it, vi } from "vitest";
import { detectAgent } from "../../utils/detect-agent";

vi.mock("am-i-vibing");

// eslint-disable-next-line @typescript-eslint/no-deprecated -- the function has a deprecated overload; we only reference it here for mocking
const mockDetectAgenticEnvironment = vi.mocked(detectAgenticEnvironment);

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
