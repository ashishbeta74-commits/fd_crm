import { Router } from 'express';
import { ACTIVITY_TYPES, CATEGORIES, FIELDS, PRIORITIES, STAGES } from '../fields.js';
import { Contact } from '../models/Contact.js';
import { getDbUri } from '../config/db.js';
import { memo } from '../lib/cache.js';

export const metaRouter = Router();

// Sheet names, tag and place counts change only on imports and edits; one aggregation a minute serves everyone.
metaRouter.get('/', async (req, res) => {
  res.json(await memo('meta', 60_000, computeMeta));
});

async function computeMeta() {
  const placeCounts = (field) => Contact.aggregate([{ $match: { [field]: { $nin: ['', null] } } }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 2000 }]);
  const [sheets, tagRows, countries, states, cities] = await Promise.all([
    Contact.distinct('source.sheetName'),
    Contact.aggregate([{ $unwind: '$tags' }, { $group: { _id: '$tags', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 500 }]),
    placeCounts('country'),
    placeCounts('state'),
    placeCounts('city'),
  ]);
  const places = (rows) => rows.map((r) => ({ name: r._id, count: r.count }));
  return {
    stages: STAGES,
    priorities: PRIORITIES,
    categories: CATEGORIES,
    fields: FIELDS,
    activityTypes: ACTIVITY_TYPES,
    sheets: sheets.filter(Boolean).sort(),
    tags: tagRows.map((t) => ({ tag: t._id, count: t.count })),
    // Place names with contact counts for the Country / State / City filters.
    countries: places(countries),
    states: places(states),
    cities: places(cities),
    db: getDbUri(),
  };
}
