import { Altar } from "@/components/Altar";
import { Candles, Footer, Topbar } from "@/components/Chrome";
import { Gargoyle } from "@/components/Gargoyle";
import { Ticker } from "@/components/Ticker";
import { formatPrice } from "@/lib/env";
import { recent } from "@/lib/wall";

export const dynamic = "force-dynamic";

const RITE = [
  ["C", "onfessio", "Lay thy petty sin upon the altar: a screenshot, a receipt, or plain words."],
  ["I", "nquisitio", "The Inquisitor reads every timestamp and dollar, names thy sin in Latin, and mocks thee for free."],
  ["C", "onsumptio", "Pay the Sin-Eater and the Gargoyle devours the evidence in fire while the server destroys its copy."],
  ["A", "bsolutio", "A signed certificate for thy wallet, and — if thou wilt — a stone in the Graveyard of Sins."]
] as const;

export default function Home() {
  return (
    <main>
      <div className="shell">
        <Topbar />
        <div className="altar-hero">
          <div>
            <div className="masthead">
              <p className="smallcaps muted" style={{ margin: "18px 0 0" }}>✠ The Holy Order of ✠</p>
              <h1 className="blackletter">Absolvo</h1>
              <p className="subtitle smallcaps">The Digital Sin-Eater</p>
              <p className="lede">
                In the Welsh borders, the poor would eat bread over a corpse for a few coins and take its sins upon themselves.
                The trade is revived. Bring thy <em>2 AM texts</em>, thy <em>fifty-five dollar burrito</em>, thy <em>nine hours of scrolling</em>, and thy <em>murders</em>.
              </p>
            </div>
            <Altar price={formatPrice()} />
          </div>
          <div className="perch">
            <Gargoyle hungry open={0.18} />
            <Candles />
          </div>
        </div>
        <ol className="rite" aria-label="The rite">
          {RITE.map(([cap, rest, text], index) => (
            <li key={rest}>
              <h3 className="blackletter"><span className="cap">{cap}</span>{rest}</h3>
              <p><span className="smallcaps muted">{["I", "II", "III", "IV"][index]}.</span> {text}</p>
            </li>
          ))}
        </ol>
      </div>
      <Ticker initial={recent({ limit: 24 })} />
      <div className="shell"><Footer /></div>
    </main>
  );
}
