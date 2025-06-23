/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Name of the event that describes the kind event that happened.
 * - SchedulerPlaced: It's the first event that creates a Cloudchamber placement. It happens when the runtime was able to retrieve deployment resources and start verify everything is correct.
 * - NetworkingIPAssigned: It's sent when the Cloudchamber runtime has mapped the IP to the container.
 * - VMStarted: It's sent when the Cloudchamber runtime has started the VM. However, it does not mean that the container is healthy.
 * - ImagePulled: It's sent when the Cloudchamber runtime has pulled the image successfully.
 * - ImagePullError: It's sent when the Cloudchamber runtime is having issues pulling image. The message and details have more information on what happened for debugging.
 * - VMFailedToStart: It's sent when the Cloudchamber runtime was unable to boot the VM.
 * - VMStopping: It's sent when the scheduler is stopping the VM.
 * - VMStopped: It's sent when the VM has finally exited.
 * - VMFailed: It's sent when the scheduling of the VM failed in the current location.
 * - RuntimeStartFailed: It's sent when the runtime had an internal error.
 * - SSHStarted: It's sent when the container has gained network connectivity and has opened the SSH port. This event is only sent when SSH keys are configured.
 * - CheckUpdate: Sent when the status of a health or readiness check changes. This may also affect the health status of the placement.
 * - DurableObjectConnected: Sent when a durable object instance connects and gains control of the deployment.
 * This event is only sent for durable object deployments. It is sent after VMStarted.
 * - ContainerStarted: It's sent when the container has started running.
 *
 */
export enum EventName {
	SCHEDULER_PLACED = "SchedulerPlaced",
	NETWORKING_IPASSIGNED = "NetworkingIPAssigned",
	VMSTARTED = "VMStarted",
	IMAGE_PULLED = "ImagePulled",
	IMAGE_PULL_ERROR = "ImagePullError",
	VMFAILED_TO_START = "VMFailedToStart",
	NETWORKING_IPASSIGNMENT_FAILED = "NetworkingIPAssignmentFailed",
	VMRUNNING = "VMRunning",
	VMSTOPPING = "VMStopping",
	VMSTOPPED = "VMStopped",
	VMFAILED = "VMFailed",
	RUNTIME_START_FAILED = "RuntimeStartFailed",
	SSHSTARTED = "SSHStarted",
	SERVICE_HEALTH_UPDATES = "ServiceHealthUpdates",
	CHECK_UPDATE = "CheckUpdate",
	DURABLE_OBJECT_CONNECTED = "DurableObjectConnected",
	CONTAINER_STARTED = "ContainerStarted",
}
