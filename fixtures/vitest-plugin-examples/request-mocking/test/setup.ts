import { afterAll, afterEach, beforeAll } from "vitest";
import { network } from "./server";

beforeAll(() => network.enable());
afterEach(() => network.resetHandlers());
afterAll(() => network.disable());
