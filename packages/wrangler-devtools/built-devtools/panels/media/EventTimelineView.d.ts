import type { PlayerEvent } from './MediaModel.js';
import { TickingFlameChart } from './TickingFlameChart.js';
export declare class PlayerEventsTimeline extends TickingFlameChart {
    private normalizedTimestamp;
    private playbackStatusLastEvent;
    private audioBufferingStateEvent;
    private videoBufferingStateEvent;
    constructor();
    private ensureNoPreviousPlaybackEvent;
    /**
     * Playback events are {kPlay, kPause, kSuspended, kEnded, and kWebMediaPlayerDestroyed}
     * once destroyed, a player cannot recieve more events of any kind.
     */
    private onPlaybackEvent;
    private bufferedEnough;
    private onBufferingStatus;
    onEvent(event: PlayerEvent): void;
}
