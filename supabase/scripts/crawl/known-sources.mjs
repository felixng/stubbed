// Official listing pages verified for venues whose search results are ambiguous
// or whose catalogue website has moved. Keep venue and city together.
const sources = [
  {
    name: 'Bridge Theatre', city: 'London',
    website: 'https://www.bridgetheatre.co.uk/',
    whats_on_url: 'https://www.bridgetheatre.co.uk/en-GB/whats-on',
    rules: {item: 'a:has(h2):has(time)', title: 'h2', dates: 'span:has(> time)'},
  },
  {
    name: 'Boulevard Theatre', city: 'London',
    website: 'https://underbellyboulevard.com/',
    whats_on_url: 'https://underbellyboulevard.com/',
    rules: {item: '.masthead-frontpage__content-left', title: 'h1', dates: '.masthead-frontpage__content-location p'},
  },
  {
    name: 'Southwark Playhouse Borough', city: 'London',
    website: 'https://southwarkplayhouse.co.uk/',
    whats_on_url: 'https://southwarkplayhouse.co.uk/whats-on/',
    rules: {
      item: 'article.wpgb-card:has(img[src*="Borough-Badge-Tab.svg"])',
      title: '.wpgb-card-body .wpgb-block-1', dates: '.wpgb-card-body .wpgb-block-3',
      link: 'a.wpgb-card-layer-link',
    },
  },
  {
    name: "Wyndham's", city: 'London',
    website: 'https://www.wyndhamstheatre.co.uk/',
    whats_on_url: 'https://www.wyndhamstheatre.co.uk/',
  },
];

export function knownSource(venue) {
  return sources.find(source => source.name === venue.name && source.city === venue.city);
}

export function knownRules(url) {
  return sources.find(source => source.whats_on_url === url)?.rules;
}
