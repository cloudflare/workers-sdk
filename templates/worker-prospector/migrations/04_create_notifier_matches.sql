create table notifier_matches (
  id integer primary key autoincrement,
  notifier_id integer not null references notifiers(id),
  url_id integer not null references urls(id),
  created datetime not null default current_timestamp
);
create unique index notifiers_notifier_idx on notifier_matches (notifier_id, url_id);