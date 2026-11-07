const CRAZY_COQS_FEED = 'https://www.brasseriezedel.com/api/get_calendar.php';

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
    name: 'Crazy Coqs', city: 'London',
    website: 'https://www.brasseriezedel.com/crazy-coqs/',
    whats_on_url: CRAZY_COQS_FEED,
  },
  {
    name: 'Circle in the Square Theatre', city: 'New York',
    website: 'https://circleinthesquare.com/',
    // The theatre's ticket page names the current show but lacks run dates.
    whats_on_url: 'https://playbill.com/venue/circle-in-the-square-theatre-vault-0000000092',
    rules: {
      item: '.bsp-list-promo-section-text:has(.bsp-list-promo-title a[href*="/production/"])',
      title: '.bsp-list-promo-title a', dates: '.bsp-list-promo-link a', link: '.bsp-list-promo-title a',
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


// The public calendar groups each performance under its explicit ISO day.
export function calendarEvents(url, body) {
  if (url !== CRAZY_COQS_FEED) return [];
  let feed;
  try { feed = JSON.parse(body); } catch { return []; }
  if (!feed?.events || Array.isArray(feed.events)) return [];
  return Object.entries(feed.events).flatMap(([date, rows]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(rows)) return [];
    return rows.filter(row => typeof row?.name === 'string' && row.stream !== true)
      .map(row => ({'@type': 'Event', name: row.name, startDate: date, endDate: date}));
  });
}
