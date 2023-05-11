create table sitemaps (
  id integer primary key autoincrement,
  url text not null,
  created datetime not null default current_timestamp
);
create unique index sitemaps_url_idx on sitemaps (url);