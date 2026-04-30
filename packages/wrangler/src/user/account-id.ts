const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isValidAccountId(accountId: string): boolean {
	return ACCOUNT_ID_PATTERN.test(accountId);
}
