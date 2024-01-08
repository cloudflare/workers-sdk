import chalk from "chalk";
import { vi } from "vitest";

vi.mock("log-update");

chalk.level = 0;
