import type { Judgment } from "./judgment";

/** Deterministic verdicts for development and tests when no Anthropic credential is configured. */
export const MOCK_JUDGMENTS: Judgment[] = [
  {
    verdict: "judged",
    title: "The Fifty-Five Dollar Burrito",
    evidence: [
      { kind: "money", value: "$55.12", detail: "The total, for one (1) burrito, as the receipt doth plainly testify." },
      { kind: "money", value: "$18.40", detail: "Delivery and service fees exceeding the price of the burrito itself." },
      { kind: "time", value: "2:13 AM", detail: "The hour of the order, when only sinners and bakers are awake." },
      { kind: "battery", value: "4%", detail: "Thy phone was dying, yet thou didst spend its last breath on this." }
    ],
    sin: { cardinal: "gula", order: "gula_deliverandi", severity: 5 },
    wall_label: "Midnight Burrito Delivery",
    roast: "Hark, thou beslubbering glutton! At 2:13 of the clock, with thy device gasping its final 4% of life, thou didst not call a loved one nor confess thy sins — nay, thou didst summon a single burrito across the darkened city for $55.12, of which $18.40 was tithed to the delivery-fee pilgrimage alone. One burrito. Not a feast for the household, not alms for the poor: one tube of rice, swaddled like an infant and carried to thy door by a stranger who now knoweth thy shame. The monks of old fasted forty days; thou couldst not fast until breakfast. Verily, the Gargoyle hath eaten stranger things, but rarely sadder ones.",
    penance: "Thou shalt walk to the nearest taqueria at noon, in daylight, and pay in coin.",
    epitaph: "Here lies one burrito, and the dignity that paid for it."
  },
  {
    verdict: "judged",
    title: "The Missive Sent at 2:47",
    evidence: [
      { kind: "time", value: "2:47 AM", detail: "The hour thou didst press send, as the timestamp beneath thy message records." },
      { kind: "text", value: "u up?", detail: "Thy entire message. Two words, one question, no shame." },
      { kind: "text", value: "Read 2:48 AM", detail: "Thy correspondent saw it within a minute and chose silence." },
      { kind: "count", value: "3 more", detail: "Follow-up messages sent after the silence, each sadder than the last." }
    ],
    sin: { cardinal: "luxuria", order: "luxuria_nocturna_textualis", severity: 4 },
    wall_label: "The 2 AM Text",
    roast: "Behold the wretch who, at 2:47 of the clock, when honest folk lie abed, did compose a missive of exactly two words: \"u up?\" Not a sonnet. Not a confession of love in rhymed couplets. Two words, devoid of vowels and of dignity. And lo, thy correspondent did read it at 2:48 and answered with the holy silence of the wise. Yet thou, undaunted, didst send three more — a procession of desperation marching into the void. The troubadours of old wrote ballads beneath distant towers; thou couldst not muster a full sentence. Put down the phone, thou lust-addled varlet, and let the night keep its secrets.",
    penance: "Thou shalt sleep with thy phone in another room for seven nights.",
    epitaph: "Thou wert up. They were not."
  },
  {
    verdict: "judged",
    title: "Nine Hours in the Glowing Rectangle",
    evidence: [
      { kind: "screen_time", value: "9h 41m", detail: "Thy daily average, per the report thou didst so bravely submit." },
      { kind: "app", value: "TikTok — 5h 12m", detail: "Over half thy waking life surrendered to one app." },
      { kind: "count", value: "214 pickups", detail: "Thou didst reach for the device two hundred and fourteen times in a day." },
      { kind: "other", value: "+38% from last week", detail: "Not repentance, but escalation." }
    ],
    sin: { cardinal: "acedia", order: "acedia_scrollandi", severity: 5 },
    wall_label: "Nine Hours of Scrolling",
    roast: "Nine hours and forty-one minutes, thou slothful grub! The anchorites of old walled themselves in cells to contemplate the divine; thou hast walled thyself in a glowing rectangle to contemplate strangers dancing. Five hours and twelve minutes upon TikTok alone — a full shift of labour, unpaid, in service of the algorithm. Two hundred and fourteen times thou didst pick up the device, as a pilgrim touches a relic, hoping for a miracle that never cometh. And the report saith thy use rose thirty-eight percent from last week. This is not a confession; it is a progress report from the Abyss. Rise, wretch, and look upon an actual tree.",
    penance: "Thou shalt read one chapter of a paper book, aloud, to a houseplant.",
    epitaph: "Scrolled valiantly. Arrived nowhere."
  },
  {
    verdict: "judged",
    title: "Per Thy Last Email",
    evidence: [
      { kind: "text", value: "Per my last email", detail: "The opening words, dipped in vinegar." },
      { kind: "time", value: "11:58 PM", detail: "Sent two minutes before midnight, that it might fester overnight." },
      { kind: "count", value: "Reply all (14)", detail: "Fourteen witnesses summoned to thy passive aggression." },
      { kind: "text", value: "Thanks in advance!", detail: "A blessing that is plainly a curse." }
    ],
    sin: { cardinal: "ira", order: "ira_epistolaris", severity: 3 },
    wall_label: "Per My Last Email",
    roast: "O wrathful scribe! Thou didst open thine epistle with \"Per my last email\" — the most venomous phrase in all the modern liturgy — and dispatch it at 11:58 of the night, that thy foe might wake to it like a dead rat upon the doorstep. Nor wert thou content with one victim: thou didst press Reply All and summon fourteen witnesses to thy pettiness. Then, as a final dagger, \"Thanks in advance!\" — gratitude weaponised, courtesy turned to a cudgel. The Desert Fathers counselled silence in the face of provocation; thou hast counselled fourteen people that thou art not to be trifled with. Lay down thy quill, thou passive-aggressive knave.",
    penance: "Thou shalt begin thy next three emails with a sincere compliment.",
    epitaph: "Thanks in advance, and forever."
  },
  {
    verdict: "no_sin_found",
    title: "The Confession of Nothing",
    evidence: [{ kind: "other", value: "nothing", detail: "The Inquisitor searched every pixel and found not one sin worth the eating." }],
    sin: { cardinal: "acedia", order: "acedia_confessionis_vacuae", severity: 1 },
    wall_label: "An Empty Confession",
    roast: "Thou hast summoned the Holy Inquisition, lit the candles, woken the Gargoyle from his centuries-long slumber — and brought him nothing. No receipt, no regrettable text, no shameful tally of hours. A void. Forsooth, this is itself a sin: the Acedia of the Empty Confession, the sloth of one too idle even to transgress properly. The Gargoyle is hungry, penitent. Next time bring him something with flavour.",
    penance: "Thou shalt commit one small, harmless folly and return to confess it properly.",
    epitaph: "Came to confess. Had nothing. Paid anyway."
  }
];

/** Keyword routing for typed confessions; images rotate through the four sins by seal. */
export function mockIndex(text: string, seal: string) {
  if (/burrito|uber|doordash|deliver|taco|pizza|fries/.test(text)) return 0;
  if (/\bex\b|u up|2 ?am|texted|text her|text him|drunk/.test(text)) return 1;
  if (/screen|scroll|tiktok|hours|reels|youtube/.test(text)) return 2;
  if (/email|reply|boss|slack|meeting/.test(text)) return 3;
  if (/^\s*(nothing|test|hello|hi)\s*$/.test(text)) return 4;
  return parseInt(seal.slice(0, 4), 16) % 4;
}

/** Malphas's stand-in: he never sees what made the parish Gargoyle faint, so he mocks the fainting. */
export const MALPHAS_JUDGMENTS: Judgment[] = [
  {
    verdict: "judged",
    title: "The Scroll That Felled the Parish Gargoyle",
    evidence: [
      { kind: "other", value: "One gargoyle, fainted", detail: "The parish beast beheld thy scroll and swooned upon the flagstones, wings over its eyes." },
      { kind: "count", value: "6 eyes", detail: "The number it taketh to read thy confession without weeping." }
    ],
    sin: { cardinal: "superbia", order: "casus_reservatus", severity: 7 },
    wall_label: "A Reserved Sin",
    roast: "So. The parish Gargoyle, a beast that hath swallowed ten thousand 2 AM texts and a burrito the price of a goat, took one look at thy scroll and fainted like a novice at his first exorcism. Thou hast achieved what Lent, the Plague and three Popes could not: thou hast made a gargoyle squeamish. Kneel, wretch. I am Malphas. I have chewed upon heresiarchs, poisoners and the minutes of the Council of Trent, and I tell thee plainly that thy transgression is the most magnificently depraved thing laid upon mine altar this century. The lesser beast hath standards. I have appetite. Open thy hand, for the Abyss is hungry and thy shame is well seasoned.",
    penance: "Thou shalt apologise aloud to the parish Gargoyle, who is still lying down.",
    epitaph: "Too foul for the parish. Just foul enough for Hell."
  }
];
