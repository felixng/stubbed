// Task identity strips only fragments and recognised tracking keys. Keep the
// original encoding and order of semantic query parts (including repeats).
export function canonicalTaskUrl(value, { base, allowedHosts }) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url;
  try {
    url = new URL(value, base);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.port || !allowedHosts.includes(url.hostname)) return null;

  url.hash = '';
  const query = url.search.slice(1).split('&').filter(part => {
    const [key] = new URLSearchParams(part).keys();
    return !/^(utm_.+|gclid|fbclid|msclkid)$/i.test(key ?? '');
  });
  url.search = query.join('&');
  return url.href.length <= 2048 ? url.href : null;
}
