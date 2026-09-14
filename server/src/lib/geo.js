// Where a contact is: city / state / country pulled apart from the free-text "location" the calling
// sheets carry ("Albany, New York", "Houston", "Toronto"), and put back together for display.

const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
};
const CA_PROVINCES = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia',
  NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
};
const AU_STATES = { NSW: 'New South Wales', VIC: 'Victoria', QLD: 'Queensland', WA: 'Western Australia', SA: 'South Australia', TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory' };

const byName = (map, country) => Object.fromEntries(Object.entries(map).flatMap(([abbr, name]) => [[name.toLowerCase(), { name, country }], [abbr.toLowerCase(), { name, country }]]));
// Abbreviation clashes (WA, NT) resolve to the US / Canada, which is where the team's lists are.
const REGIONS = { ...byName(AU_STATES, 'Australia'), ...byName(CA_PROVINCES, 'Canada'), ...byName(US_STATES, 'United States') };

const COUNTRY_ALIASES = {
  usa: 'United States', us: 'United States', 'u.s.': 'United States', 'u.s.a.': 'United States', 'united states of america': 'United States', america: 'United States',
  uk: 'United Kingdom', 'u.k.': 'United Kingdom', england: 'United Kingdom', scotland: 'United Kingdom', wales: 'United Kingdom', 'great britain': 'United Kingdom',
  uae: 'United Arab Emirates',
};
const COUNTRIES = new Set([
  'United States', 'Canada', 'United Kingdom', 'Australia', 'Singapore', 'India', 'Ireland', 'France', 'Germany', 'Italy', 'Spain', 'Mexico', 'Brazil',
  'Japan', 'China', 'Hong Kong', 'United Arab Emirates', 'South Africa', 'New Zealand', 'Netherlands', 'Switzerland', 'Sweden', 'Norway', 'Denmark',
  'Belgium', 'Austria', 'Portugal', 'Greece', 'Turkey', 'Israel', 'Philippines', 'Malaysia', 'Thailand', 'Indonesia', 'Argentina', 'Chile', 'Colombia', 'Peru',
]);
const COUNTRY_BY_LOWER = new Map([...COUNTRIES].map((c) => [c.toLowerCase(), c]));

// Cities the lists contain that give the country away without a state.
const CITY_COUNTRY = {
  toronto: 'Canada', vancouver: 'Canada', montreal: 'Canada', montréal: 'Canada', calgary: 'Canada', ottawa: 'Canada', winnipeg: 'Canada', edmonton: 'Canada', mississauga: 'Canada',
  london: 'United Kingdom', manchester: 'United Kingdom', birmingham: 'United Kingdom', edinburgh: 'United Kingdom', glasgow: 'United Kingdom',
  sydney: 'Australia', melbourne: 'Australia', brisbane: 'Australia', 'south brisbane': 'Australia', perth: 'Australia', adelaide: 'Australia',
  singapore: 'Singapore', dubai: 'United Arab Emirates', 'hong kong': 'Hong Kong', dublin: 'Ireland', paris: 'France', tokyo: 'Japan', mumbai: 'India', delhi: 'India', 'new delhi': 'India', bangalore: 'India', bengaluru: 'India',
};

// Well-known US cities whose state is unambiguous (the calling sheets often give just the city).
const US_CITY_STATE = {
  'new york': 'NY', brooklyn: 'NY', queens: 'NY', bronx: 'NY', manhattan: 'NY', 'long island city': 'NY', albany: 'NY', buffalo: 'NY', rochester: 'NY', syracuse: 'NY', 'white plains': 'NY', yonkers: 'NY', 'garden city': 'NY', 'new rochelle': 'NY',
  'los angeles': 'CA', 'san francisco': 'CA', 'san diego': 'CA', 'san jose': 'CA', sacramento: 'CA', oakland: 'CA', 'culver city': 'CA', burbank: 'CA', 'santa monica': 'CA', 'beverly hills': 'CA', pasadena: 'CA', 'long beach': 'CA', irvine: 'CA', anaheim: 'CA', 'newport beach': 'CA', emeryville: 'CA', 'universal city': 'CA', 'westlake village': 'CA', 'palo alto': 'CA', 'mountain view': 'CA', 'menlo park': 'CA', 'san mateo': 'CA', 'redwood city': 'CA', glendale: 'CA', 'el segundo': 'CA', 'sherman oaks': 'CA', 'woodland hills': 'CA', 'costa mesa': 'CA', fresno: 'CA',
  houston: 'TX', dallas: 'TX', austin: 'TX', 'san antonio': 'TX', 'fort worth': 'TX', plano: 'TX', irving: 'TX', 'el paso': 'TX', frisco: 'TX', 'the woodlands': 'TX',
  miami: 'FL', orlando: 'FL', tampa: 'FL', 'fort lauderdale': 'FL', jacksonville: 'FL', 'boca raton': 'FL', 'coral springs': 'FL', 'pompano beach': 'FL', sarasota: 'FL', naples: 'FL', 'west palm beach': 'FL', 'palm beach': 'FL', 'st. petersburg': 'FL', 'saint petersburg': 'FL', 'coral gables': 'FL', 'miami beach': 'FL', 'delray beach': 'FL',
  chicago: 'IL', evanston: 'IL', naperville: 'IL', 'oak brook': 'IL', schaumburg: 'IL',
  atlanta: 'GA', alpharetta: 'GA', savannah: 'GA', marietta: 'GA',
  boston: 'MA', cambridge: 'MA', marlborough: 'MA', waltham: 'MA', newton: 'MA', worcester: 'MA', burlington: 'MA',
  seattle: 'WA', bellevue: 'WA', redmond: 'WA', tacoma: 'WA', spokane: 'WA',
  denver: 'CO', boulder: 'CO', 'colorado springs': 'CO', aurora: 'CO', englewood: 'CO', 'greenwood village': 'CO',
  phoenix: 'AZ', scottsdale: 'AZ', tempe: 'AZ', tucson: 'AZ', mesa: 'AZ', chandler: 'AZ',
  'las vegas': 'NV', reno: 'NV', henderson: 'NV',
  philadelphia: 'PA', pittsburgh: 'PA', exton: 'PA', 'king of prussia': 'PA', harrisburg: 'PA', 'bala cynwyd': 'PA',
  nashville: 'TN', memphis: 'TN', knoxville: 'TN', chattanooga: 'TN', franklin: 'TN',
  charlotte: 'NC', raleigh: 'NC', durham: 'NC', 'chapel hill': 'NC', greensboro: 'NC', cary: 'NC',
  omaha: 'NE', lincoln: 'NE',
  minneapolis: 'MN', 'st. paul': 'MN', 'saint paul': 'MN', 'eden prairie': 'MN', bloomington: 'MN',
  detroit: 'MI', 'ann arbor': 'MI', 'grand rapids': 'MI', troy: 'MI', southfield: 'MI',
  columbus: 'OH', cleveland: 'OH', cincinnati: 'OH', dayton: 'OH', akron: 'OH',
  baltimore: 'MD', bethesda: 'MD', rockville: 'MD', annapolis: 'MD', 'silver spring': 'MD',
  washington: 'DC',
  montvale: 'NJ', newark: 'NJ', 'jersey city': 'NJ', hoboken: 'NJ', princeton: 'NJ', parsippany: 'NJ', morristown: 'NJ', 'short hills': 'NJ', paramus: 'NJ', edison: 'NJ', 'fort lee': 'NJ', secaucus: 'NJ', 'red bank': 'NJ', 'basking ridge': 'NJ', 'bridgewater': 'NJ',
  reston: 'VA', arlington: 'VA', alexandria: 'VA', 'virginia beach': 'VA', richmond: 'VA', mclean: 'VA', 'tysons': 'VA', norfolk: 'VA', charlottesville: 'VA',
  'salt lake city': 'UT', 'park city': 'UT', provo: 'UT',
  portland: 'OR', 'lake oswego': 'OR', beaverton: 'OR',
  'kansas city': 'MO', 'st. louis': 'MO', 'saint louis': 'MO',
  indianapolis: 'IN', carmel: 'IN',
  milwaukee: 'WI', madison: 'WI',
  'new orleans': 'LA', 'baton rouge': 'LA',
  louisville: 'KY', lexington: 'KY',
  'oklahoma city': 'OK', tulsa: 'OK',
  honolulu: 'HI', anchorage: 'AK', boise: 'ID', 'des moines': 'IA', 'little rock': 'AR', birmingham: 'AL', charleston: 'SC', 'greenville': 'SC', 'myrtle beach': 'SC', hartford: 'CT', stamford: 'CT', greenwich: 'CT', 'new haven': 'CT', providence: 'RI', albuquerque: 'NM', 'santa fe': 'NM', wilmington: 'DE', 'sioux falls': 'SD', fargo: 'ND', billings: 'MT', cheyenne: 'WY', 'jackson hole': 'WY', jackson: 'MS', manchester: 'NH', burlington: 'VT', 'san juan': 'PR',
};

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** State + country for a well-known US city ("Houston" -> Texas / United States); null when the city is not on the list. */
export function knownCityRegion(city) {
  const abbr = US_CITY_STATE[clean(city).toLowerCase()];
  return abbr ? { state: US_STATES[abbr], country: 'United States' } : null;
}

/** Canonical country name for free text ("USA" -> "United States"); '' when it is not a country we know. */
export function normalizeCountry(text) {
  const t = clean(text).toLowerCase();
  if (!t) return '';
  return COUNTRY_ALIASES[t] || COUNTRY_BY_LOWER.get(t) || '';
}

/** Canonical state / province for free text ("NY" -> "New York"); null when unknown. */
export function normalizeRegion(text) {
  const t = clean(text).toLowerCase().replace(/\.$/, '');
  return t ? REGIONS[t] || null : null;
}

/**
 * "Albany, New York" -> { city: 'Albany', state: 'New York', country: 'United States' }.
 * Comma parts are read as city, state, country (any may be missing); a lone known state or
 * country is taken as such; the country is inferred from the state or from well-known cities.
 */
export function splitLocation(text) {
  const out = { city: '', state: '', country: '' };
  const parts = clean(text).split(/\s*[,;|/]\s*|\s+-\s+/).map(clean).filter(Boolean);
  if (!parts.length) return out;
  // A lone "New York" in the calling sheets is the city (the state is implied).
  if (parts.length === 1 && parts[0].toLowerCase() === 'new york') return { city: 'New York', state: 'New York', country: 'United States' };
  const rest = [];
  for (const p of parts) {
    const country = normalizeCountry(p);
    if (country && !out.country) {
      out.country = country;
      continue;
    }
    // "Birmingham AL" / "Houston TX" as a single part
    const m = p.match(/^(.+?)\s+([A-Za-z]{2})$/);
    const region = normalizeRegion(p) || (m && normalizeRegion(m[2]) ? { ...normalizeRegion(m[2]), cityPart: m[1] } : null);
    if (region && !out.state && (rest.length || parts.length === 1 || region.cityPart || parts.indexOf(p) > 0)) {
      out.state = region.name;
      if (!out.country) out.country = region.country;
      if (region.cityPart && !out.city) out.city = region.cityPart;
      continue;
    }
    rest.push(p);
  }
  if (rest.length && !out.city) out.city = rest[0];
  if (rest.length > 1 && !out.state) out.state = rest[1];
  if (!out.country && out.city) out.country = CITY_COUNTRY[out.city.toLowerCase()] || '';
  if (out.city && !out.state && !out.country) {
    const known = knownCityRegion(out.city);
    if (known) Object.assign(out, known);
  }
  return out;
}

/** Display text from the parts: "Albany, New York, United States" (empties skipped). */
export function composeLocation({ city = '', state = '', country = '' } = {}) {
  return [city, state, country].map(clean).filter(Boolean).join(', ');
}
