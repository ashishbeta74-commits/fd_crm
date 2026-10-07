// Sheet workspaces: a CRM page per Google Sheet whose rows are not contacts (enquiries, incidents, ...).
// Each workspace is described here - fields, which sheet headers feed them, the column that identifies
// a row - and services/workspaces.js + routes/workspaces.js + the client's workspace components do the
// rest. Adding a sheet = adding an entry here and a sidebar link in client/src/lib/workspaces.js.
//
// field: { key, label, headers: [normalised sheet headers], type: 'text' | 'date' | 'number' | 'enum' | 'email' | 'phone' | 'long',
//          filter?: true (a dropdown of the values in use), inline?: true (edit in the table), options?: [...] (enum choices),
//          search?: true, sort?: true, width?: 'w-40' (table cell width), hide?: true (not a table column) }
// Headers are matched after lowercasing and removing everything but letters and digits, with any "( ... )" part
// dropped first: "DATE ( DOUBLE CLICK )" -> "date", "ENQUIRY ID (AUTO GENERATED)" -> "enquiryid".

export const WORKSPACES = [
  {
    key: 'enquiries',
    label: 'Daily Enquiries',
    description: 'Every enquiry from the Daily Enquiry Sheet: who asked, from where, for what, who handled it, what was quoted and how it ended.',
    rowLabel: 'enquiry',
    sheet: {
      url: 'https://docs.google.com/spreadsheets/d/1uJBSFyhb9R-zGwejn9wSuHHBnR6ad4CsECpUu09Tn-I/edit?gid=0#gid=0',
      // '' = the tab the link points to (gid); the DASHBOARD / INCIDENT / LEAD SOURCE tabs are left alone
      tabs: [],
    },
    // The column that identifies a row across syncs (falls back to email / name, then the row number).
    keyField: 'enquiryId',
    // The main date (date range filter, default sort) and the status field (the tiles count its values).
    dateField: 'date',
    statusField: 'status',
    valueField: 'businessValue',
    defaultSort: { field: 'date', dir: 'desc' },
    fields: [
      { key: 'enquiryId', label: 'Enquiry ID', headers: ['enquiryid', 'enquiryno', 'id'], type: 'text', search: true, sort: true, width: 'w-32' },
      { key: 'date', label: 'Date', headers: ['date', 'enquirydate'], type: 'date', sort: true },
      { key: 'leadType', label: 'Lead type', headers: ['leadtype'], type: 'enum', filter: true, inline: true, options: ['NEW', 'REPEAT'] },
      { key: 'leadChannel', label: 'Channel', headers: ['leadchannel', 'channel'], type: 'enum', filter: true, inline: true, options: ['EMAIL', 'PHONE CALL', 'TEXT MESSAGE', 'WHATSAPP'] },
      { key: 'leadSource', label: 'Source', headers: ['leadsource', 'source'], type: 'enum', filter: true, inline: true, options: ['AFFILIATE', 'DIRECT', 'REFERENCE'] },
      { key: 'receivedOn', label: 'Received on', headers: ['requestreceivedfromwhichemailid', 'receivedon', 'emailid'], type: 'enum', filter: true, inline: true, options: ['RESERVATIONS', 'INFO', 'HARRY'] },
      { key: 'clientContact', label: 'Client email / phone', headers: ['clientemailidphoneno', 'clientemail', 'clientphone', 'contact'], type: 'text', search: true, inline: true, width: 'w-56' },
      { key: 'clientName', label: 'Client name', headers: ['clientname', 'client', 'name'], type: 'text', search: true, sort: true, inline: true, width: 'w-52' },
      { key: 'city', label: 'City', headers: ['city'], type: 'text', filter: true, search: true, sort: true, inline: true },
      { key: 'serviceType', label: 'Service', headers: ['servicetype', 'service'], type: 'enum', filter: true, inline: true, options: ['AIRPORT TRANSFERS', 'P2P', 'HOURLY'] },
      { key: 'travelDate', label: 'Travel date', headers: ['traveldate', 'dateoftravel'], type: 'date', sort: true },
      { key: 'pickup', label: 'Pickup', headers: ['pickupaddress', 'pickup'], type: 'text', search: true, inline: true, width: 'w-56' },
      { key: 'drop', label: 'Drop', headers: ['drop', 'dropaddress', 'dropoff'], type: 'text', search: true, inline: true, width: 'w-56' },
      { key: 'vehicle', label: 'Vehicle', headers: ['vehiclereq', 'vehicle', 'vehiclerequired'], type: 'enum', filter: true, inline: true, options: ['SEDAN', 'SUV', 'SPRINTER', 'MINI COACH', 'BUS'] },
      { key: 'leadWith', label: 'Lead with', headers: ['leadwith', 'handledby', 'agent'], type: 'enum', filter: true, inline: true, options: ['HAROON', 'ABDUL', 'RAHUL', 'GURLEEN', 'PANKAJ', 'JASLEEN', 'SUKHPREET', 'HARRY'] },
      { key: 'quotedAmount', label: 'Quoted', headers: ['quotedamount', 'quote', 'quoted'], type: 'text', search: true, inline: true, width: 'w-44' },
      { key: 'status', label: 'Status', headers: ['status'], type: 'enum', filter: true, inline: true, sort: true, options: ['RESPONSE AWAITED', 'CONVERTED', 'NOT INTERESTED'] },
      { key: 'remarks', label: 'Remarks', headers: ['remarks', 'notes', 'comments'], type: 'long', search: true, inline: true, width: 'w-80' },
      { key: 'followUpInstructions', label: 'Follow-up instructions', headers: ['followupinstructions', 'instructions'], type: 'enum', filter: true, inline: true, options: ["IT'S GETTING DELAYED", 'REACH OUT TO CLIENT', 'WAIT'] },
      { key: 'ageing', label: 'Ageing', headers: ['ageing', 'aging'], type: 'text', inline: true, width: 'w-24' },
      { key: 'followUpCount', label: 'Follow-ups', headers: ['followupcount', 'followups'], type: 'number', sort: true, inline: true, width: 'w-24' },
      { key: 'followUp1', label: 'Follow-up 1', headers: ['followupdate1', 'followup1'], type: 'date', inline: true },
      { key: 'followUp2', label: 'Follow-up 2', headers: ['followupdate2', 'followup2'], type: 'date', inline: true },
      { key: 'followUp3', label: 'Follow-up 3', headers: ['followupdate3', 'followup3'], type: 'date', inline: true },
      { key: 'followUp4', label: 'Follow-up 4', headers: ['followupdate4', 'followup4'], type: 'date', inline: true },
      { key: 'followUp5', label: 'Follow-up 5', headers: ['followupdate5', 'followup5'], type: 'date', inline: true },
      { key: 'followUp6', label: 'Follow-up 6', headers: ['followupdate6', 'followup6'], type: 'date', inline: true },
      { key: 'businessValue', label: 'Business value', headers: ['businesvalue', 'businessvalue', 'value'], type: 'number', sort: true, inline: true, width: 'w-28' },
    ],
  },
];

export const WORKSPACE_MAP = Object.fromEntries(WORKSPACES.map((w) => [w.key, w]));
export const getWorkspace = (key) => WORKSPACE_MAP[key] || null;

/** What the web app needs to render a workspace (everything but the sheet link, which the meta endpoint carries). */
export const publicWorkspace = (w) => ({
  key: w.key,
  label: w.label,
  description: w.description,
  rowLabel: w.rowLabel,
  keyField: w.keyField,
  dateField: w.dateField,
  statusField: w.statusField,
  valueField: w.valueField || '',
  defaultSort: w.defaultSort,
  fields: w.fields.map(({ headers, ...f }) => f),
});
