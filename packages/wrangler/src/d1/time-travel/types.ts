export interface BookmarkResponse {
	bookmark: string;
}

export interface RestoreBookmarkResponse {
	bookmark: string;
	previous_bookmark: string;
	message: string;
}
