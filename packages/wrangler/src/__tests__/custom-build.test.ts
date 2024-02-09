import { runCustomBuild } from "../deployment-bundle/run-custom-build";
import { UserError } from "../errors";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("Custom Builds", () => {
	runInTempDir();

	it("runCustomBuild throws UserError when a command fails", async () => {
		await expect(
			runCustomBuild("/", "/", { command: `node -e "process.exit(1)"` })
		).rejects.toBeInstanceOf(UserError);
	});
});
