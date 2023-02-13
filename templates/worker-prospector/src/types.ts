export interface DBSitemap {
	id: number;
	url: string;
}

export interface DBUrl {
	id: number;
	url: string;
	lastmod: string;
	sitemap_id: number;
	last_checked: string;
}

export interface DBNotifier {
	id: number;
	keyword: string;
	email: string;
}

export interface DBNotifierMatch {
	id: number;
	notifier_id: number;
	url_id: number;
}

export interface Url {
	url: string;
	lastmod: string;
	sitemapId: string;
}

export enum XMLResponseType {
	Error = "Error",
	Sitemap = "Sitemap",
	SitemapOfSitemaps = "SitemapOfSitemaps",
}

export interface XMLResponse {
	type: XMLResponseType;
}

export interface SitemapXMLResponse extends XMLResponse {
	urls: Array<Url>;
}

export interface SitemapOfSitemapsXMLResponse extends XMLResponse {
	sitemaps: Array<string>;
}

export interface ErrorXMLResponse extends XMLResponse {
	error: string;
}

export interface Env {
	AUTH_TOKEN: string;
	DB: D1Database;
	QUEUE: Queue;
	SITEMAP_URL: string;
}
