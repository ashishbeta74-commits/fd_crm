import { Router } from 'express';
import { ACTIVITY_TYPES, CATEGORIES, FIELDS, LEAD_QUALITIES, PRIORITIES, STAGES } from '../fields.js';
import { Contact } from '../models/Contact.js';
import { getDbUri } from '../config/db.js';
import { memo } from '../lib/cache.js';

export const metaRouter = Router();

// Sheet names, tag and place counts change only on imports and edits, so one aggregation serves
// everyone; it is kept warm in the background (lib/cache.js), so no request waits for it.
export const META_TTL = 60_000;
metaRouter.get('/', async (req, res) => {
  res.json(await memo('meta', META_TTL, computeMeta));
});

export async function computeMeta() {
  // One pass over the contacts for every filter list (it used to be six separate collection scans).
  const counts = (field, limit) => [{ $match: { [field]: { $nin: ['', null] } } }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: limit }];
  const [facet] = await Contact.aggregate([
    { $project: { _id: 0, sheet: '$source.sheetName', tags: 1, country: 1, state: 1, city: 1, leadQuality: 1 } },
    {
      $facet: {
        sheets: [{ $group: { _id: '$sheet' } }],
        tags: [{ $unwind: '$tags' }, { $group: { _id: '$tags', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 500 }],
        countries: counts('country', 2000),
        states: counts('state', 2000),
        cities: counts('city', 2000),
        leadQualities: counts('leadQuality', 2000),
      },
    },
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
    db: getDbUri(),
  };
}
