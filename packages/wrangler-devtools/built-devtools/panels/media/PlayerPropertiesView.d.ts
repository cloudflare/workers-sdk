import * as Platform from '../../core/platform/platform.js';
import * as UI from '../../ui/legacy/legacy.js';
import type * as Protocol from '../../generated/protocol.js';
declare type TabData = {
    [x: string]: string;
};
export declare const enum PlayerPropertyKeys {
    Resolution = "kResolution",
    TotalBytes = "kTotalBytes",
    Bitrate = "kBitrate",
    MaxDuration = "kMaxDuration",
    StartTime = "kStartTime",
    IsVideoEncrypted = "kIsVideoEncrypted",
    IsStreaming = "kIsStreaming",
    FrameUrl = "kFrameUrl",
    FrameTitle = "kFrameTitle",
    IsSingleOrigin = "kIsSingleOrigin",
    IsRangeHeaderSupported = "kIsRangeHeaderSupported",
    RendererName = "kRendererName",
    VideoDecoderName = "kVideoDecoderName",
    AudioDecoderName = "kAudioDecoderName",
    IsPlatformVideoDecoder = "kIsPlatformVideoDecoder",
    IsPlatformAudioDecoder = "kIsPlatformAudioDecoder",
    VideoEncoderName = "kVideoEncoderName",
    IsPlatformVideoEncoder = "kIsPlatformVideoEncoder",
    IsVideoDecryptingDemuxerStream = "kIsVideoDecryptingDemuxerStream",
    IsAudioDecryptingDemuxerStream = "kIsAudioDecryptingDemuxerStream",
    AudioTracks = "kAudioTracks",
    TextTracks = "kTextTracks",
    VideoTracks = "kVideoTracks",
    Framerate = "kFramerate",
    VideoPlaybackRoughness = "kVideoPlaybackRoughness",
    VideoPlaybackFreezing = "kVideoPlaybackFreezing"
}
export declare class PropertyRenderer extends UI.Widget.VBox {
    private readonly title;
    private readonly contents;
    private value;
    private pseudoColorProtectionElement;
    constructor(title: Platform.UIString.LocalizedString);
    updateData(propname: string, propvalue: string): void;
    protected updateDataInternal(propname: string, propvalue: string | null): void;
    changeContents(value: string | null): void;
}
export declare class FormattedPropertyRenderer extends PropertyRenderer {
    private readonly formatfunction;
    constructor(title: Platform.UIString.LocalizedString, formatfunction: (arg0: string) => string);
    updateDataInternal(propname: string, propvalue: string | null): void;
}
export declare class DefaultPropertyRenderer extends PropertyRenderer {
    constructor(title: Platform.UIString.LocalizedString, defaultText: string);
}
export declare class DimensionPropertyRenderer extends PropertyRenderer {
    private width;
    private height;
    constructor(title: Platform.UIString.LocalizedString);
    updateDataInternal(propname: string, propvalue: string | null): void;
}
export declare class AttributesView extends UI.Widget.VBox {
    private readonly contentHash;
    constructor(elements: UI.Widget.Widget[]);
    getContentHash(): number;
}
export declare class TrackManager {
    private readonly type;
    private readonly view;
    constructor(propertiesView: PlayerPropertiesView, type: string);
    updateData(_name: string, value: string): void;
    addNewTab(tabs: GenericTrackMenu | NoTracksPlaceholderMenu, tabData: TabData, tabNumber: number): void;
}
export declare class VideoTrackManager extends TrackManager {
    constructor(propertiesView: PlayerPropertiesView);
}
export declare class TextTrackManager extends TrackManager {
    constructor(propertiesView: PlayerPropertiesView);
}
export declare class AudioTrackManager extends TrackManager {
    constructor(propertiesView: PlayerPropertiesView);
}
declare class GenericTrackMenu extends UI.TabbedPane.TabbedPane {
    private readonly decoderName;
    private readonly trackName;
    constructor(decoderName: string, trackName?: string);
    addNewTab(trackNumber: number, element: AttributesView): void;
}
declare class NoTracksPlaceholderMenu extends UI.Widget.VBox {
    private isPlaceholder;
    private readonly wrapping;
    constructor(wrapping: GenericTrackMenu, placeholderText: string);
    addNewTab(trackNumber: number, element: AttributesView): void;
}
export declare class PlayerPropertiesView extends UI.Widget.VBox {
    private readonly mediaElements;
    private readonly videoDecoderElements;
    private readonly audioDecoderElements;
    private readonly textTrackElements;
    private readonly attributeMap;
    private readonly videoProperties;
    private readonly videoDecoderProperties;
    private readonly audioDecoderProperties;
    private readonly videoDecoderTabs;
    private readonly audioDecoderTabs;
    private textTracksTabs;
    constructor();
    private lazyCreateTrackTabs;
    getTabs(type: string): GenericTrackMenu | NoTracksPlaceholderMenu;
    onProperty(property: Protocol.Media.PlayerProperty): void;
    formatKbps(bitsPerSecond: string | number): string;
    formatTime(seconds: string | number): string;
    formatFileSize(bytes: string): string;
    populateAttributesAndElements(): void;
    wasShown(): void;
}
export {};
