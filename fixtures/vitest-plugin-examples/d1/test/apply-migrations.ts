import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Setup files run outside the per-test-file storage isolation, and may be run
// multiple times. `applyD1Migrations()` only applies migrations that haven't
// already been applied, therefore it is safe to call this function here.
await applyD1Migrations(env.DATABASE, env.TEST_MIGRATIONS);
