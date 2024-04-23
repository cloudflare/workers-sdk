type Bindings = {
  [key in keyof CloudflareBindings]: CloudflareBindings[key]
}