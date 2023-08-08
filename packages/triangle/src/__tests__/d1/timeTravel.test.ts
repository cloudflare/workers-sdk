import { useMockIsTTY } from "../helpers/mock-istty";
import { runTriangle } from "../helpers/run-triangle";
import writeTriangleToml from "../helpers/write-triangle-toml";

describe("time-travel", () => {
	const { setIsTTY } = useMockIsTTY();

	describe("restore", () => {
		it("should reject the use of --timestamp with --bookmark", async () => {
			setIsTTY(false);
			writeTriangleToml({
				d1_databases: [
					{ binding: "DATABASE", database_name: "db", database_id: "xxxx" },
				],
			});

			await expect(
				runTriangle(
					"d1 time-travel restore db --timestamp=1234 --bookmark=5678"
				)
			).rejects.toThrowError(
				`Provide either a timestamp, or a bookmark - not both.`
			);
		});
	});
});
