import { jwtVerify, JWTVerifyResult } from "jose";
import { it, vi } from "vitest";

vi.mock("jose", () => {
	const jwtVerify = async (): Promise<JWTVerifyResult<unknown>> => {
		return { payload: { mock: true }, protectedHeader: { alg: "" } };
	};
	return { jwtVerify };
});

it("uses mocked module", async ({ expect }) => {
	const result = await jwtVerify("", new Uint8Array());
	expect(result.payload).toStrictEqual({ mock: true });
});
