import { grayBar, leftT, spinner } from "@cloudflare/cli/interactive";
import { collectCLIOutput } from "./helpers/collect-cli-output";
import { useMockIsTTY } from "./helpers/mock-istty";
import { createCLIParser } from "../index";

describe("cli", () => {
	describe("spinner", () => {
		const std = collectCLIOutput();
		const { setIsTTY } = useMockIsTTY();
		test("does not animate when stdout is not a TTY", async () => {
			setIsTTY(false);
			const s = spinner();
			const startMsg = "Start message";
			s.start(startMsg);
			const stopMsg = "Stop message";
			s.stop(stopMsg);
			expect(std.out).toEqual(
				`${leftT} ${startMsg}\n${grayBar} ${stopMsg}\n${grayBar}\n`
			);
		});
	});
	describe("createCLIParser", () => {
		const originalEnv = process.env;

		beforeEach(() => {
			process.env = { ...originalEnv };
		});

		afterAll(() => {
			process.env = originalEnv;
		});

		it("should use CLOUDFLARE_ENV as fallback for env", async () => {
			process.env.CLOUDFLARE_ENV = "test-env";
			const parser = createCLIParser(["whoami"]);
			const args = await parser.wrangler.argv;
			expect(args.env).toBe("test-env");
		});

		it("should allow --env to override CLOUDFLARE_ENV", async () => {
			process.env.CLOUDFLARE_ENV = "test-env";
			const parser = createCLIParser(["whoami", "--env", "prod-env"]);
			const args = await parser.wrangler.argv;
			expect(args.env).toBe("prod-env");
		});
	});
});
