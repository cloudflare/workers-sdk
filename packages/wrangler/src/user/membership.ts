import { fetchPagedListResult } from "../cfetch";

/**
 * Body for the list memberships endpoint.
 * See:
 * https://developers.cloudflare.com/api/operations/user'-s-account-memberships-list-memberships
 */
type MembershipAccountWithRoles = {
	account: { id: string; name: string };
	roles: Array<string>;
};

/**
 * Checks the membership roles of the caller in the given account.
 * @param account the account to check membership for.
 */
export async function fetchMembershipRoles(accountTag: string) {
	const allMemberships =
		await fetchPagedListResult<MembershipAccountWithRoles>("/memberships");
	const membership = allMemberships.find((m) => m.account.id === accountTag);
	return membership?.roles;
}
