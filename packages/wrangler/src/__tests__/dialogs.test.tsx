import { fromDashMessagePrompt } from "../dialogs";
import { CI } from "../is-ci";
import { useMockIsTTY } from "./helpers/mock-istty";

describe("fromDashMessagePrompt", () => {
	const { setIsTTY } = useMockIsTTY();
	beforeEach(() => {
		setIsTTY(false); // not interactive
		jest.spyOn(CI, "isCI").mockReturnValue(true); //in CI
	});

	it("should return undefined when last deployed from api", async () => {
		const result = await fromDashMessagePrompt("api");
		expect(result).toBe(undefined);
	});

	it("should return undefined when last deployed from wrangler", async () => {
		const result = await fromDashMessagePrompt("wrangler");
		expect(result).toBe(undefined);
	});

	it("should return true when last deployed from dash", async () => {
		const result = await fromDashMessagePrompt("dash");
		expect(result).toBe(true);
	});
});
