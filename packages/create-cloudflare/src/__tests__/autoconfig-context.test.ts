import { error, log, warn } from "@cloudflare/cli-shared-helpers";
import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import { execaCommand } from "execa";
import { beforeEach, describe, test, vi } from "vitest";
import { createC3AutoConfigContext } from "../autoconfig-context";

vi.mock("@cloudflare/cli-shared-helpers");
vi.mock("@cloudflare/cli-shared-helpers/interactive");
vi.mock("@cloudflare/workers-utils");
vi.mock("execa");

describe("createC3AutoConfigContext", () => {
	beforeEach(() => {
		vi.mocked(isNonInteractiveOrCI).mockReturnValue(false);
	});

	describe("logger", () => {
		test("routes log and info to `log`, joining args with spaces", ({
			expect,
		}) => {
			const { logger } = createC3AutoConfigContext();

			logger.log("hello", "world");
			logger.info("foo", 42);

			expect(log).toHaveBeenCalledWith("hello world");
			expect(log).toHaveBeenCalledWith("foo 42");
		});

		test("routes warn to `warn`", ({ expect }) => {
			const { logger } = createC3AutoConfigContext();

			logger.warn("careful");

			expect(warn).toHaveBeenCalledWith("careful");
		});

		test("routes error to `error`", ({ expect }) => {
			const { logger } = createC3AutoConfigContext();

			logger.error("boom");

			expect(error).toHaveBeenCalledWith("boom");
		});

		test("suppresses debug output", ({ expect }) => {
			const { logger } = createC3AutoConfigContext();

			logger.debug("noisy");

			expect(log).not.toHaveBeenCalled();
			expect(warn).not.toHaveBeenCalled();
			expect(error).not.toHaveBeenCalled();
		});
	});

	describe("dialogs", () => {
		test("confirm delegates to inputPrompt with a confirm prompt", async ({
			expect,
		}) => {
			vi.mocked(inputPrompt).mockResolvedValue(true as never);
			const { dialogs } = createC3AutoConfigContext();

			const result = await dialogs.confirm("Proceed?", { defaultValue: true });

			expect(result).toBe(true);
			expect(inputPrompt).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "confirm",
					question: "Proceed?",
					defaultValue: true,
				})
			);
		});

		test("select maps choices to inputPrompt options", async ({ expect }) => {
			vi.mocked(inputPrompt).mockResolvedValue("react" as never);
			const { dialogs } = createC3AutoConfigContext();

			const result = await dialogs.select("Framework?", {
				choices: [
					{ title: "React", value: "react" },
					{ title: "Vue", value: "vue" },
				],
				defaultOption: 1,
			});

			expect(result).toBe("react");
			expect(inputPrompt).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "select",
					question: "Framework?",
					options: [
						{ label: "React", value: "react" },
						{ label: "Vue", value: "vue" },
					],
					defaultValue: "vue",
				})
			);
		});
	});

	describe("runCommand", () => {
		test("runs the command in a shell with the given cwd", async ({
			expect,
		}) => {
			vi.mocked(execaCommand).mockResolvedValue({} as never);
			const context = createC3AutoConfigContext();

			await context.runCommand("npm run build", "/tmp/project", "[build]");

			expect(execaCommand).toHaveBeenCalledWith("npm run build", {
				shell: true,
				cwd: "/tmp/project",
				stdio: "inherit",
			});
		});
	});
});
