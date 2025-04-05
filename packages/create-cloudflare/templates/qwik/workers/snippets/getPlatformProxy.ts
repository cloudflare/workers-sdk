let platform = {};

if(process.env.NODE_ENV === 'development') {
  const { getPlatformProxy } = await import('wrangler');
  platform = await getPlatformProxy();
}
