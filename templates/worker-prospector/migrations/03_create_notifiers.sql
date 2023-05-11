create table notifiers (
  id integer primary key autoincrement,
  email text not null,
  keyword text not null,
  created datetime not null default current_timestamp
);
create unique index notifiers_keyword_idx on notifiers (keyword);