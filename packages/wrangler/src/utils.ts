import { loginOrRefreshIfRequired, getAccountId } from "./user";

import type { Config } from "./config";

/**
 * Ensure that a user is logged in, and a valid account_id is available.
 */
export async function requireAuth(
  config: Config,
  isInteractive = true
): Promise<string> {
  const loggedIn = await loginOrRefreshIfRequired(isInteractive);
  if (!loggedIn) {
    // didn't login, let's just quit
    throw new Error("Did not login, quitting...");
  }
  const accountId = config.account_id || (await getAccountId(isInteractive));
  if (!accountId) {
    throw new Error("No account id found, quitting...");
  }

  return accountId;
}
