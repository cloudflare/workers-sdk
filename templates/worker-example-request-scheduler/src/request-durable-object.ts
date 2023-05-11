import { ScheduledRequest } from './types';

export class RequestDurableObject {
	id: string | DurableObjectId;
	storage: DurableObjectStorage;

	constructor(state: DurableObjectState) {
		this.storage = state.storage;
		this.id = state.id;
	}

	async fetch(request: Request) {
		// read scheduled request from request body
		const scheduledRequest: ScheduledRequest = await request.json();

		// save scheduled request data to Durable Object storage, set the alarm, and return Durable Object id
		this.storage.put('request', scheduledRequest);
		this.scheduleAlarm(scheduledRequest);

		// return scheduled request ID
		return new Response(
			JSON.stringify({
				id: this.id.toString(),
			}),
			{
				headers: {
					'content-type': 'application/json',
				},
			}
		);
	}

	async alarm() {
		// read the scheduled request from Durable Object storage
		const scheduledRequest: ScheduledRequest | undefined = await this.storage.get('request');

		// execute the scheduled request URL, pass scheduled request ID header to every request
		if (scheduledRequest) {
			const response = await fetch(scheduledRequest.url, {
				headers: {
					'x-scheduled-request-id': this.id.toString(),
					...scheduledRequest.requestInit?.headers,
				},
				...scheduledRequest.requestInit,
			});

			console.log(
				`Request ID ${this.id.toString()} => HTTP ${response.status} (${response.statusText})`
			);

			if (scheduledRequest.triggerEverySeconds) {
				// reschedule request
				this.scheduleAlarm(scheduledRequest);
			} else {
				// cleanup Durable Object storage
				this.storage.deleteAll();
			}
		}
	}

	scheduleAlarm(scheduledRequest: ScheduledRequest) {
		// scheduledTime defaults to current timestamp
		let scheduledTime: number = Date.now();

		// override scheduledTime based on scheduledRequest properties
		if (scheduledRequest.triggerEverySeconds) {
			scheduledTime += scheduledRequest.triggerEverySeconds * 1000;
		} else if (scheduledRequest.triggerAt) {
			scheduledTime = scheduledRequest.triggerAt;
		}

		console.log(
			`Request ID ${this.id.toString()} (re)scheduled for ${new Date(scheduledTime).toISOString()}`
		);

		// schedule Durable Object alarm
		this.storage.setAlarm(scheduledTime);
	}
}
