import { ExtensionEndpoint } from './ExtensionEndpoint.js';
export declare class RecorderExtensionEndpoint extends ExtensionEndpoint {
    private readonly name;
    private readonly mediaType;
    constructor(name: string, mediaType: string, port: MessagePort);
    getName(): string;
    getMediaType(): string;
    protected handleEvent({ event }: {
        event: string;
    }): void;
    /**
     * In practice, `recording` is a UserFlow[1], but we avoid defining this type on the
     * API in order to prevent dependencies between Chrome and puppeteer. Extensions
     * are responsible for working out potential compatibility issues.
     *
     * [1]: https://github.com/puppeteer/replay/blob/main/src/Schema.ts#L245
     */
    stringify(recording: Object): Promise<string>;
    /**
     * In practice, `step` is a Step[1], but we avoid defining this type on the
     * API in order to prevent dependencies between Chrome and puppeteer. Extensions
     * are responsible for working out compatibility issues.
     *
     * [1]: https://github.com/puppeteer/replay/blob/main/src/Schema.ts#L243
     */
    stringifyStep(step: Object): Promise<string>;
}
