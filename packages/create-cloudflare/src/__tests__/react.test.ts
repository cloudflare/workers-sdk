import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import { runFrameworkGenerator } from "frameworks/index";
import { beforeEach, describe, test, vi } from "vitest";
import reactPages from "../../templates/react/pages/c3";
import reactWorkers from "../../templates/react/workers/c3";
import { createTestArgs, createTestContext } from "./helpers";
import type { TemplateConfig } from "../templates";

vi.mock("frameworks/index");
vi.mock("helpers/packages");
vi.mock("@cloudflare/cli-shared-helpers/interactive");

describe("React variant selection", () => {
	beforeEach(() => {
		vi.mocked(inputPrompt).mockImplementation(async (options) => {
			if (options.acceptDefault) {
				return options.defaultValue;
			}

			throw new Error(
				`Unexpected interactive prompt: ${String(options.question)}`
			);
		});
	});

	test.for([
		["workers", reactWorkers],
		["pages", reactPages],
	] as const)(
		"uses the default variant for %s with --accept-defaults instead of prompting",
		async ([, template]: readonly [string, TemplateConfig], { expect }) => {
			const ctx = createTestContext(
				"test",
				createTestArgs({ framework: "react", acceptDefaults: true })
			);
			ctx.template = template;

			await template.generate?.(ctx);

			expect(runFrameworkGenerator).toHaveBeenCalledWith(ctx, [
				"test",
				"--template",
				"react-ts",
				"--no-immediate",
			]);
		}
	);
});
