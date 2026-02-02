export const EventName = {
	SchedulerPlaced: true,
	ImagePulled: true,
	ImagePullError: true,
	VMStarted: true,
	VMStopped: true,
	NetworkingIPAssigned: true,
	NetworkingIPAssignmentFailed: true,
	RuntimeStartFailed: true,
	VMFailedToStart: true,
	SSHStarted: true,
} as const;

export type EventName = keyof typeof EventName;
