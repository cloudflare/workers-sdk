import makeServiceWorkerEnv from "service-worker-mock";
import { vi } from "vitest";

vi.stubGlobal('globalThis', makeServiceWorkerEnv())