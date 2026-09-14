// Generates samples/sample-contacts.xlsx (3 sheets with different header styles)
// so the import flow can be tried without real data.
import path from 'node:path';
import fs from 'node:fs';
import ExcelJS from 'exceljs';

const out = path.resolve(process.cwd(), '..', 'samples', 'sample-contacts.xlsx');
fs.mkdirSync(path.dirname(out), { recursive: true });

const wb = new ExcelJS.Workbook();
const d = (s) => new Date(`${s}T00:00:00.000Z`);
const t = (h, m) => new Date(Date.UTC(1899, 11, 30, h, m));

const leads = wb.addWorksheet('Leads');
leads.columns = [
  { header: 'Name', key: 'name', width: 22 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'Title', key: 'title', width: 22 },
  { header: 'Company', key: 'company', width: 22 },
  { header: 'Website', key: 'website', width: 24 },
  { header: 'Phone', key: 'phone', width: 16 },
  { header: 'Location', key: 'location', width: 16 },
  { header: 'Status', key: 'status', width: 16 },
  { header: 'Follow Up', key: 'followUp', width: 12 },
  { header: 'Notes', key: 'notes', width: 36 },
];
leads.addRows([
  { name: 'Aarav Mehta', email: 'aarav.mehta@bluepeak.io', title: 'Head of Operations', company: 'BluePeak Logistics', website: 'bluepeak.io', phone: '+91 98200 11223', location: 'Mumbai', status: 'Voicemail', followUp: d('2026-09-12'), notes: 'Left VM, try after 3pm' },
  { name: 'Sofia Rossi', email: 'sofia@rossidesign.it', title: 'Founder', company: 'Rossi Design Studio', website: 'rossidesign.it', phone: '+39 06 555 0143', location: 'Rome', status: 'Connected', followUp: d('2026-09-15'), notes: 'Interested in a demo next week' },
  { name: 'Daniel Okafor', email: 'daniel.okafor@nairatech.com', title: 'CTO', company: 'NairaTech', website: 'nairatech.com', phone: '+234 802 555 0198', location: 'Lagos', status: 'Wrong number', notes: 'Number belongs to someone else' },
  { name: 'Emily Chen', email: 'emily.chen@harborhealth.org', title: 'Procurement Lead', company: 'Harbor Health', website: 'harborhealth.org', phone: '+1 415 555 0121', location: 'San Francisco', status: 'Not interested', notes: 'Already using a competitor' },
  { name: 'Lucas Martin', email: 'lucas.martin@atelier-m.fr', title: 'Directeur', company: 'Atelier M', website: 'atelier-m.fr', phone: '+33 1 55 55 01 77', location: 'Paris', status: 'New' },
  { name: 'Priya Nair', email: 'priya.nair@kochifoods.in', title: 'Owner', company: 'Kochi Foods', website: 'kochifoods.in', phone: '+91 98470 55512', location: 'Kochi', status: 'connected - interested', followUp: d('2026-09-11'), notes: 'Send pricing sheet' },
  { name: 'Tom Becker', email: 'tom@beckerbau.de', title: 'Geschaftsfuhrer', company: 'Becker Bau GmbH', website: 'beckerbau.de', phone: '+49 30 555 0166', location: 'Berlin', status: 'no answer' },
  { name: 'Hannah Lee', email: 'hannah.lee@seoulbright.kr', title: 'Marketing Director', company: 'Seoul Bright', website: 'seoulbright.kr', phone: '+82 2 555 0134', location: 'Seoul', status: 'Converted', notes: 'Signed annual plan' },
  { name: 'Carlos Alvarez', email: 'carlos@alvarezmotors.mx', title: 'General Manager', company: 'Alvarez Motors', website: 'alvarezmotors.mx', phone: '+52 55 5555 0102', location: 'Mexico City', status: 'Ready', followUp: d('2026-09-18'), notes: 'Waiting on contract signature' },
  { name: 'Grace Williams', email: 'grace.williams@northwind-ltd.co.uk', title: 'Office Manager', company: 'Northwind Ltd', website: 'northwind-ltd.co.uk', phone: '+44 20 7946 0158', location: 'London', status: 'Pending' },
  { name: 'Aarav Mehta', email: 'aarav.mehta@bluepeak.io', title: 'Head of Operations', company: 'BluePeak Logistics', phone: '+91 98200 11223', location: 'Mumbai', status: 'Voicemail', notes: 'Duplicate row in sheet - merged on import' },
]);

const prospects = wb.addWorksheet('Prospects');
prospects.columns = [
  { header: 'Full Name', key: 'name', width: 22 },
  { header: 'Primary Email', key: 'primaryEmail', width: 28 },
  { header: 'Second Email', key: 'secondaryEmail', width: 28 },
  { header: 'Job Title', key: 'title', width: 22 },
  { header: 'Company Name', key: 'companyName', width: 22 },
  { header: 'Company Info', key: 'companyInfo', width: 30 },
  { header: 'Company No', key: 'companyNo', width: 16 },
  { header: 'Contact Main', key: 'contactMain', width: 16 },
  { header: 'Contact L1 Info', key: 'contactL1', width: 16 },
  { header: 'Location', key: 'location', width: 16 },
  { header: 'Stage', key: 'stage', width: 14 },
  { header: 'Started', key: 'started', width: 14 },
  { header: 'Follow-up Date', key: 'followUp', width: 14 },
  { header: 'Remarks', key: 'remarks', width: 36 },
];
prospects.addRows([
  { name: 'Sofia Rossi', primaryEmail: 'sofia@rossidesign.it', secondaryEmail: 'sofia.rossi@gmail.com', title: 'Founder', companyName: 'Rossi Design Studio', companyInfo: 'Interior design, 12 staff', companyNo: '+39 06 555 0140', contactMain: '+39 06 555 0143', contactL1: 'https://www.linkedin.com/in/sofia-rossi-example', location: 'Rome', stage: 'Prospect', started: 'Connected', followUp: d('2026-09-15'), remarks: 'Demo booked, wants Italian invoices' },
  { name: 'Mateo Silva', primaryEmail: 'mateo.silva@silvaagro.br', secondaryEmail: '', title: 'Owner', companyName: 'Silva Agro', companyInfo: 'Agriculture exports', companyNo: '+55 11 5555 0130', contactMain: '+55 11 95555 0130', contactL1: '', location: 'Sao Paulo', stage: 'Ready', started: 'Connected', followUp: d('2026-09-14'), remarks: 'Send proposal v2' },
  { name: 'Yuki Tanaka', primaryEmail: 'y.tanaka@tanakaprint.jp', secondaryEmail: 'yuki.t@outlook.com', title: 'Sales Manager', companyName: 'Tanaka Print', companyInfo: 'Commercial printing', companyNo: '+81 3 5555 0177', contactMain: '+81 90 5555 0177', contactL1: '', location: 'Tokyo', stage: 'Prospect', started: 'Voicemail', followUp: d('2026-09-09'), remarks: 'Called twice, try mornings' },
  { name: 'Fatima Al Sayed', primaryEmail: 'fatima@gulfbridge.ae', secondaryEmail: '', title: 'Managing Partner', companyName: 'Gulf Bridge Consulting', companyInfo: 'Consulting, Dubai + Riyadh', companyNo: '+971 4 555 0111', contactMain: '+971 50 555 0111', contactL1: '', location: 'Dubai', stage: 'Converted', started: 'Connected', remarks: 'Paid, onboarding scheduled' },
  { name: 'Noah Fischer', primaryEmail: 'noah.fischer@alpinegear.ch', secondaryEmail: '', title: 'COO', companyName: 'Alpine Gear AG', companyInfo: 'Outdoor equipment retail', companyNo: '+41 44 555 0188', contactMain: '+41 79 555 0188', contactL1: '', location: 'Zurich', stage: 'Done', started: 'Connected', remarks: 'Project completed' },
  { name: 'Isabella Costa', primaryEmail: 'isabella@costaviagens.pt', secondaryEmail: '', title: 'Director', companyName: 'Costa Viagens', companyInfo: 'Travel agency', companyNo: '+351 21 555 0102', contactMain: '+351 91 555 0102', contactL1: '', location: 'Lisbon', stage: '', started: 'No need', remarks: 'Closing the business next year' },
  { name: 'Omar Haddad', primaryEmail: 'omar.haddad@cedarsoft.lb', secondaryEmail: '', title: 'CEO', companyName: 'Cedar Soft', companyInfo: 'Software services', companyNo: '+961 1 555 019', contactMain: '+961 3 555 019', contactL1: '', location: 'Beirut', stage: 'Prospect', started: 'Connected', followUp: d('2026-09-20'), remarks: 'Evaluating budget' },
  { name: 'Chloe Dubois', primaryEmail: 'chloe.dubois@maisondubois.fr', secondaryEmail: 'chloe.d@yahoo.fr', title: 'Owner', companyName: 'Maison Dubois', companyInfo: 'Bakery chain, 6 shops', companyNo: '+33 4 55 55 01 44', contactMain: '+33 6 55 55 01 44', contactL1: '', location: 'Lyon', stage: 'Ready', started: 'Connected', followUp: d('2026-09-16'), remarks: 'Needs approval from partner' },
]);

const bookings = wb.addWorksheet('Bookings');
bookings.columns = [
  { header: 'Contact Name', key: 'name', width: 22 },
  { header: 'Email Address', key: 'email', width: 28 },
  { header: 'Company', key: 'company', width: 22 },
  { header: 'Mobile', key: 'mobile', width: 16 },
  { header: 'Location', key: 'location', width: 16 },
  { header: 'Status', key: 'status', width: 18 },
  { header: 'Date', key: 'date', width: 12 },
  { header: 'Time', key: 'time', width: 10 },
  { header: 'Note', key: 'note', width: 36 },
];
bookings.getColumn('date').numFmt = 'dd-mm-yyyy';
bookings.getColumn('time').numFmt = 'hh:mm';
bookings.addRows([
  { name: 'Sofia Rossi', email: 'sofia@rossidesign.it', company: 'Rossi Design Studio', mobile: '+39 333 555 0143', location: 'Rome', status: 'Future booking', date: d('2026-09-22'), time: t(10, 30), note: 'Demo over video call' },
  { name: 'Liam O Brien', email: 'liam@obrienplumbing.ie', company: "O'Brien Plumbing", mobile: '+353 87 555 0122', location: 'Dublin', status: 'Booked', date: d('2026-09-25'), time: t(14, 0), note: 'On-site visit' },
  { name: 'Amara Osei', email: 'amara.osei@accrafresh.gh', company: 'Accra Fresh', mobile: '+233 24 555 0156', location: 'Accra', status: 'Future booking', date: d('2026-10-02'), time: t(9, 0), note: 'Call back after harvest season' },
  { name: 'Ethan Walker', email: 'ethan.walker@walkerlaw.com.au', company: 'Walker Law', mobile: '+61 2 5555 0131', location: 'Sydney', status: 'Appointment', date: d('2026-09-13'), time: t(16, 15), note: 'Partner meeting' },
  { name: 'Mia Johansson', email: 'mia@nordicnest.se', company: 'Nordic Nest', mobile: '+46 8 555 0142', location: 'Stockholm', status: 'Rescheduled', date: d('2026-09-30'), time: t(11, 0), note: 'Moved from 20 Sep' },
  { name: 'Ravi Shankar', email: 'ravi@shankarsteel.in', company: 'Shankar Steel', mobile: '+91 98110 55519', location: 'Delhi', status: 'Done', date: d('2026-09-05'), time: t(12, 0), note: 'Completed, send invoice' },
]);

await wb.xlsx.writeFile(out);
console.log(`Sample workbook written to ${out}`);
