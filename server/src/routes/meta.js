import { Router } from 'express';
import { ACTIVITY_TYPES, CATEGORIES, FIELDS, LEAD_QUALITIES, PRIORITIES, STAGES } from '../fields.js';
import { Contact } from '../models/Contact.js';
import { getDbUri } from '../config/db.js';
import { memo } from '../lib/cache.js';
import { AREA_CODE_PATTERN, AREA_CODE_REGION } from '../lib/areaCodes.js';
import { SheetRating } from '../models/SheetRating.js';

export const metaRouter = Router();

// Sheet names, tag and place counts change only on imports and edits, so one aggregation serves
// everyone; it is kept warm in the background (lib/cache.js), so no request waits for it.
export const META_TTL = 60_000;
metaRouter.get('/', async (req, res) => {
  res.json(await memo('meta', META_TTL, computeMeta));
});

// Company names with contact counts, for the Company filter. Its own endpoint (fetched when the filter
// opens) because thousands of companies would bloat the meta every page loads.
metaRouter.get('/companies', async (req, res) => {
  res.json(await memo('meta:companies', META_TTL, computeCompanies));
});

export async function computeCompanies() {
  const rows = await Contact.aggregate([
    { $match: { companyName: { $nin: ['', null] } } },
    { $group: { _id: '$companyName', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 20000 },
  ]);
  return { items: rows.map((r) => ({ name: r._id, count: r.count })) };
}

// The area code of a field, or null (a NANP number at the start of it, see lib/areaCodes.js).
// ($regexFind throws on a non-string input, so anything else counts as no number)
const areaCode = (field) => ({ $let: { vars: { m: { $regexFind: { input: { $cond: [{ $eq: [{ $type: `$${field}` }, 'string'] }, `$${field}`, null] }, regex: AREA_CODE_PATTERN } } }, in: { $arrayElemAt: [{ $ifNull: ['$$m.captures', []] }, 0] } } });

export async function computeMeta() {
  // One pass over the contacts for every filter list (it used to be six separate collection scans).
  const counts = (field, limit) => [{ $match: { [field]: { $nin: ['', null] } } }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: limit }];
  const [[facet], ratings] = await Promise.all([
    Contact.aggregate([
      { $project: { _id: 0, sheet: '$source.sheetName', tags: 1, country: 1, state: 1, city: 1, leadQuality: 1, codes: { $setUnion: [[areaCode('contactMain'), areaCode('companyNo')]] } } },
      {
        $facet: {
          sheets: [{ $group: { _id: '$sheet' } }],
          tags: [{ $unwind: '$tags' }, { $group: { _id: '$tags', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 500 }],
          countries: counts('country', 2000),
          states: counts('state', 2000),
          cities: counts('city', 2000),
          leadQualities: counts('leadQuality', 2000),
          // a contact counts once per code, even when both of its phones share it
          areaCodes: [{ $unwind: '$codes' }, { $match: { codes: { $ne: null } } }, { $group: { _id: '$codes', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }],
        },
      },
    ]),
    SheetRating.find().select('name stars').lean(),
  ]);
  const sheets = (facet?.sheets || []).map((r) => r._id);
  const tagRows = facet?.tags || [];
  const places = (rows) => (rows || []).map((r) => ({ name: r._id, count: r.count }));
  return {
    stages: STAGES,
    priorities: PRIORITIES,
    categories: CATEGORIES,
    fields: FIELDS,
    activityTypes: ACTIVITY_TYPES,
    sheets: sheets.filter(Boolean).sort(),
    tags: tagRows.map((t) => ({ tag: t._id, count: t.count })),
    // Place names with contact counts for the Country / State / City filters.
    countries: places(facet?.countries),
    states: places(facet?.states),
    cities: places(facet?.cities),
    // Suggested presets first, then every label in use with its count ("Other…" values included).
    leadQualities: LEAD_QUALITIES,
    leadQualityCounts: places(facet?.leadQualities),
    // Area codes in use (contact or company phone) with their state / province and contact counts.
    areaCodes: (facet?.areaCodes || []).map((r) => ({ code: r._id, region: AREA_CODE_REGION[r._id] || '', count: r.count })),
    // List name -> stars (1-5); unrated lists are absent.
    sheetStars: Object.fromEntries(ratings.map((r) => [r.name, r.stars])),
    db: getDbUri(),
  };
}
