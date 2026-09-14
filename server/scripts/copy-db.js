// Copy the CRM collections (contacts, importbatches) from one MongoDB to another,
// e.g. from the embedded local database to Atlas once the Atlas IP allow-list is fixed:
//   node --env-file-if-exists=.env scripts/copy-db.js mongodb://127.0.0.1:27017/crm "$MONGODB_URI"
// Modes:
//   (default)  the target collections must be empty
//   --force    empty the target collections first, then copy everything
//   --merge    keep the target's data and add only the documents whose _id it does not have yet
// --skip-list="Name" (repeatable) leaves out one list: its contacts (source.sheetName) and its
// import batches (source.listName), e.g. when the target already has that sheet imported.
import mongoose from 'mongoose';

const args = process.argv.slice(2);
const uris = args.filter((a) => !a.startsWith('--'));
const flags = args.filter((a) => a.startsWith('--'));
const fromUri = uris[0];
const toUri = uris[1] || process.env.MONGODB_URI;
const force = flags.includes('--force');
const merge = flags.includes('--merge');
const skipLists = flags.filter((f) => f.startsWith('--skip-list=')).map((f) => f.slice('--skip-list='.length).replace(/^"|"$/g, ''));
if (!fromUri || !toUri || (force && merge)) {
  console.error('Usage: node scripts/copy-db.js <fromUri> [toUri] [--force | --merge] [--skip-list="List name"]...');
  process.exit(1);
}
const redact = (u) => u.replace(/\/\/([^@/]+)@/, '//***@');
const LIST_FIELD = { contacts: 'source.sheetName', importbatches: 'source.listName' };

const from = await mongoose.createConnection(fromUri, { serverSelectionTimeoutMS: 15000 }).asPromise();
const to = await mongoose.createConnection(toUri, { serverSelectionTimeoutMS: 15000 }).asPromise();
console.log(`from ${redact(fromUri)} -> ${redact(toUri)}${merge ? ' (merge)' : force ? ' (replace)' : ''}`);
if (skipLists.length) console.log(`skipping lists: ${skipLists.join(', ')}`);

for (const name of Object.keys(LIST_FIELD)) {
  const src = from.db.collection(name);
  const dst = to.db.collection(name);
  const existing = await dst.countDocuments();
  if (existing && !force && !merge) {
    console.error(`${name}: target already has ${existing} documents (use --force to replace them or --merge to add the missing ones)`);
    process.exit(2);
  }
  if (existing && force) await dst.deleteMany({});
  const filter = skipLists.length ? { [LIST_FIELD[name]]: { $nin: skipLists } } : {};
  let docs = await src.find(filter).toArray();
  const total = docs.length;
  if (merge && existing) {
    const have = new Set((await dst.find({}, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id)));
    docs = docs.filter((d) => !have.has(String(d._id)));
  }
  if (docs.length) await dst.insertMany(docs, { ordered: false });
  console.log(`${name}: copied ${docs.length} documents${merge ? ` (${total - docs.length} already in the target)` : ''}, target now has ${await dst.countDocuments()}`);
}
await from.close();
await to.close();
console.log('done');
