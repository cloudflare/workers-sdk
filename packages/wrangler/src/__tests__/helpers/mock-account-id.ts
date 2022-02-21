const ORIGINAL_CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ORIGINAL_CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

/**
 * Mock the API token so that we don't need to read it from user configuration files.
 */
export function mockApiToken({
  apiToken = "some-api-token",
}: { apiToken?: string } = {}) {
  beforeEach(() => {
    process.env.CLOUDFLARE_API_TOKEN = apiToken;
  });
  afterEach(() => {
    process.env.CLOUDFLARE_API_TOKEN = ORIGINAL_CLOUDFLARE_API_TOKEN;
  });
}

/**
 * Mock the current account ID so that we don't need to read it from configuration files.
 */
export function mockAccountId({
  accountId = "some-account-id",
}: { accountId?: string } = {}) {
  beforeEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
  });
  afterEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = ORIGINAL_CLOUDFLARE_ACCOUNT_ID;
  });
}
