import { TypedEvent } from "./index";
import type {
	Properties as MetricsProperties,
	EventNames as MetricsEventNames,
} from "../../metrics";
import type { MetricsConfigOptions } from "../../metrics/metrics-config";

export class MetricsEvent extends TypedEvent<"metrics"> {
	public event: MetricsEventNames;
	public options: MetricsConfigOptions;
	public properties: MetricsProperties;

	/**
	 * Create a metrics event with no extra properties.
	 *
	 * This overload assumes that you do not want to configure analytics with options.
	 */
	constructor(event: MetricsEventNames);

	/**
	 * Create a metrics event with no extra properties.
	 */
	constructor(event: MetricsEventNames, options: MetricsConfigOptions);

	/**
	 * Create a metrics event.
	 *
	 * Generally you should pass the `send_metrics` property from the wrangler.toml config here,
	 * which would override any user permissions.
	 */
	constructor(
		event: MetricsEventNames,
		properties: MetricsProperties,
		options: MetricsConfigOptions
	);

	constructor(
		event: MetricsEventNames,
		...args:
			| []
			| [MetricsConfigOptions]
			| [MetricsProperties, MetricsConfigOptions]
	) {
		super("metrics", { cancelable: false });
		this.event = event;
		this.options = args.pop() ?? {};
		this.properties = (args.pop() ?? {}) as MetricsProperties;
	}
}
