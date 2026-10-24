const REGIONS = new Set(["Africa", "America", "Asia", "Atlantic", "Australia", "Europe", "Indian", "Pacific"]);
const RENAMED: Record<string, string> = {
  Calcutta: "Kolkata", Saigon: "Ho Chi Minh City", "Ho Chi Minh": "Ho Chi Minh City", Kiev: "Kyiv", Rangoon: "Yangon",
  Katmandu: "Kathmandu", Godthab: "Nuuk", Ashkhabad: "Ashgabat", Thimbu: "Thimphu", Ulan_Bator: "Ulaanbaatar",
  Indianapolis: "Indianapolis", Buenos_Aires: "Buenos Aires", Port_of_Spain: "Port of Spain"
};

function known(tz: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; }
  catch { return false; }
}

/** A coarse, consent-only place for the Graveyard: the city that names the browser's timezone. */
export function placeFromTimezone(tz: string | null | undefined): string | null {
  if (!tz || tz.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){1,2}$/.test(tz) || !known(tz)) return null;
  const [region, ...rest] = tz.split("/");
  if (!REGIONS.has(region)) return null;
  const city = rest.at(-1)!;
  if (/^(GMT|UTC|Etc)/i.test(city)) return null;
  return RENAMED[city] ?? city.replace(/_/g, " ");
}

export function soulPhrase(place: string | null) { return place ? `A soul in ${place}` : "A soul somewhere in Christendom"; }
