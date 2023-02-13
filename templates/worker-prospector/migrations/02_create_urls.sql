create table urls (
  id integer primary key autoincrement,
  url text not null,
  lastmod datetime,
  sitemap_id integer not null references sitemaps(id),
  last_checked datetime,
  last_scraped datetime,
  created datetime not null default current_timestamp
);
create unique index urls_url_idx on urls (url);