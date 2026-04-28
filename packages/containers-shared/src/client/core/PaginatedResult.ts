/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type ResultInfo = {
	page_token?: string;
	per_page?: number;
	next_page_token?: string;
};

export type PaginatedResult<T> = {
	data: T;
	resultInfo?: ResultInfo;
};
