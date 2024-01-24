import { AccountService } from "./client";
import type { CompleteAccountCustomer, Location } from "./client";

let cachedAccount: CompleteAccountCustomer | undefined;

export async function loadAccount() {
	if (cachedAccount !== undefined) {
		return cachedAccount;
	}

	const account = await AccountService.getMe();
	cachedAccount = account;
	return cachedAccount;
}

export async function getLocations(): Promise<Location[]> {
	return (await loadAccount()).locations;
}

export function idToLocationName(locationId: string): string {
	if (!cachedAccount) throw new Error("Needs a call to loadAccount beforehand");
	const locations = cachedAccount.locations;
	for (const location of locations) {
		if (location.location === locationId) {
			return location.name;
		}
	}

	return `Other (${locationId})`;
}
