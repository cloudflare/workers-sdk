import { DurableObject } from 'cloudflare:workers';

export class IssuesStore extends DurableObject {
	async getLastUpdatedTimestamp(): Promise<string> {
		const timestamp = await this.ctx.storage.get<string>('lastUpdatedTimestamp');

		console.log(`Retrieved timestamp from storage: ${timestamp}`);

		if (timestamp) {
			return timestamp;
		}

		return '2000-01-01T00:00:00Z';
	}

	async setLastUpdatedTimestamp(timestamp: string): Promise<void> {
		await this.ctx.storage.put('lastUpdatedTimestamp', timestamp);

		console.log(`Added timestamp to storage: ${await this.ctx.storage.get('lastUpdatedTimestamp')}`);
	}
}
