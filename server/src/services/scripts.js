// Phone scripts and Q&A seeded on first start: a chauffeur company (Famous Drive NYC) calling travel
// advisors and executive assistants. Facts the team must fill in are left as [brackets].
import { Script } from '../models/Script.js';

export const DEFAULT_SCRIPTS = [
  {
    kind: 'script',
    builtInKey: 'opening-travel-advisor',
    category: 'Opening',
    title: 'Opening – travel advisor',
    body: `Hi [first name], this is [your name] from Famous Drive in New York. Do you have a quick minute?

We're a chauffeur company in NYC – airport transfers, hourly cars, and event transport – and we work with travel advisors who need a reliable ground partner for clients coming into the city.

I'm not calling to sell you anything today. I just wanted to introduce us so that next time a client needs a car in New York, you have someone you can trust with them.

Can I ask – when your clients travel to New York, how do you usually arrange their cars?

[Listen. If they use a service: "Got it – how has that been going?" If they don't: "So the client sorts it out themselves?"]

Would it help if I sent over a one-page rate sheet and our advisor commission details, so you have it on file?`,
  },
  {
    kind: 'script',
    builtInKey: 'opening-executive-assistant',
    category: 'Opening',
    title: 'Opening – executive assistant',
    body: `Hi [first name], this is [your name] from Famous Drive – we're a chauffeur service here in New York. Is this a bad time?

I'm reaching out to assistants who book cars for their executives. We handle airport runs, meetings across the city, and full-day bookings, with the same driver each time where possible.

Quick question – when [executive's name / your team] needs a car in New York, is that something you arrange?

[If yes:] What matters most to you when you book – on-time pickups, invoicing, a driver you know?

I'd love to send you our rate sheet and set up a corporate account so booking is one email. Would that be useful?`,
  },
  {
    kind: 'script',
    builtInKey: 'voicemail',
    category: 'Voicemail',
    title: 'Voicemail',
    body: `Hi [first name], this is [your name] from Famous Drive in New York.

We're a chauffeur company that works with [travel advisors / executive assistants] on airport transfers and car service across the city.

I'll send you a short email with our rates so you have it on file. If it's easier to talk, you can reach me at [your phone].

Thanks, and have a great day.`,
  },
  {
    kind: 'script',
    builtInKey: 'follow-up',
    category: 'Follow-up',
    title: 'Follow-up call',
    body: `Hi [first name], it's [your name] from Famous Drive – we spoke on [day] about car service in New York.

I sent over the rate sheet on [date]; did you get a chance to look at it?

[If yes:] Any questions on the rates or how booking works?
[If no:] No problem – the short version is [airport transfers from $X, hourly from $Y], and you book by email or phone with a confirmation back within the hour.

Do you have anyone travelling to New York in the next few weeks that we could take care of?`,
  },
  {
    kind: 'script',
    builtInKey: 'gatekeeper',
    category: 'Opening',
    title: 'Gatekeeper / receptionist',
    body: `Hi, this is [your name] from Famous Drive in New York. Could you point me to whoever arranges car service or travel for the team?

[If they ask what it's about:] We're a chauffeur company – I'd like to send over our rates so they have a New York option on file.

[If not available:] Could I get their name and email? I'll send the details rather than keep calling.`,
  },
  {
    kind: 'qa',
    builtInKey: 'qa-already-have',
    category: 'Objections',
    title: '"We already have a car service."',
    body: `Great – most of the people I talk to do. I'm not asking you to switch.

Keep us as your backup for New York: the day your usual provider can't cover a pickup, or you have a VIP who needs extra care, you have someone to call.

Can I send the rate sheet so it's on file? No obligation.`,
  },
  {
    kind: 'qa',
    builtInKey: 'qa-rates',
    category: 'Pricing',
    title: '"What are your rates?"',
    body: `Airport transfers start at [$X] (JFK / LGA / EWR to Manhattan), hourly service from [$Y] with a [Z]-hour minimum. Those are all-in – tolls, gratuity and waiting time are [included / listed separately].

For advisors we also pay a [N]% referral commission on completed bookings.

I'll email the full rate sheet so you have exact numbers.`,
  },
  {
    kind: 'qa',
    builtInKey: 'qa-send-email',
    category: 'Objections',
    title: '"Just send me an email."',
    body: `Happy to. Is [email on file] the best address?

So the email is useful and not just another one in the inbox – is there anything specific you'd want to see? Airport rates, hourly, or event transport?

I'll send it today and follow up [day] to make sure it landed.`,
  },
  {
    kind: 'qa',
    builtInKey: 'qa-areas',
    category: 'Service',
    title: '"What areas do you cover?"',
    body: `All five boroughs and the airports – JFK, LaGuardia and Newark – plus Westchester, Long Island, New Jersey and Connecticut.

Longer trips (the Hamptons, Philadelphia, DC, Boston) are quoted as point-to-point.`,
  },
  {
    kind: 'qa',
    builtInKey: 'qa-vehicles',
    category: 'Service',
    title: '"What vehicles do you have?"',
    body: `[Sedans – e.g. Cadillac / Mercedes], [SUVs – e.g. Suburban / Escalade] for up to [6] passengers with luggage, and [sprinter vans] for groups.

All black, all late-model, all professionally detailed before every job.`,
  },
  {
    kind: 'qa',
    builtInKey: 'qa-licensed',
    category: 'Service',
    title: '"Are your drivers licensed and insured?"',
    body: `Yes – every driver is TLC-licensed, background-checked, and every vehicle carries commercial livery insurance. We can send certificates of insurance for corporate accounts.`,
  },
  {
    kind: 'qa',
    builtInKey: 'qa-booking',
    category: 'Booking',
    title: '"How do we book?"',
    body: `Email or phone, and you get a written confirmation within the hour with the driver's name and number the day before.

For regular bookings we set up a corporate account: one monthly invoice, saved passenger preferences, and a dedicated contact.`,
  },
  {
    kind: 'qa',
    builtInKey: 'qa-flight-delay',
    category: 'Service',
    title: '"What happens if the flight is delayed?"',
    body: `We track the flight, so the driver adjusts to the actual landing time – no extra charge for delays. The passenger gets a text when the driver is at the terminal, and waiting time starts only after [X] minutes past landing.`,
  },
  {
    kind: 'qa',
    builtInKey: 'qa-not-interested',
    category: 'Objections',
    title: '"Not interested."',
    body: `Understood – thanks for taking the call.

One last thing: if I send a single email with our rates, would it be okay to keep you on file for New York? No further calls unless you reach out.

[If no:] No problem at all. Have a good day.`,
  },
  {
    kind: 'qa',
    builtInKey: 'qa-cancellation',
    category: 'Booking',
    title: '"What is your cancellation policy?"',
    body: `Free cancellation up to [X hours] before pickup; inside that window [the policy]. Airport pickups tied to a flight follow the flight, so a cancelled flight is not charged if we're told before the driver is dispatched.`,
  },
];

/** First start: seed everything. Later: only on an explicit "restore" (force), so deleted built-ins stay deleted. */
export async function seedScripts({ force = false } = {}) {
  const any = await Script.countDocuments();
  if (any && !force) return 0;
  const existing = new Set((await Script.find().select('builtInKey').lean()).map((s) => s.builtInKey).filter(Boolean));
  let added = 0;
  for (const [i, s] of DEFAULT_SCRIPTS.entries()) {
    if (existing.has(s.builtInKey)) continue;
    await Script.create({ ...s, builtIn: true, order: i });
    added += 1;
  }
  return added;
}
