import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { RETURN_LINK_TTL_MS } from "@/lib/give";
import { buttonConfig, giveEnv, payClientFrom, returnOrigin, type GiveEnv } from "@/lib/give/amazonPay";
import { chooseGift, premiumFor, sealGift, ships, SIZES, type GiftChoice } from "@/lib/give/premiums";
import { openListener, sealListener } from "@/lib/give/token";
import { dollars, LEVELS, tierById, tierLabel, type Tier } from "@/lib/give/tiers";
import { AmazonPayButton } from "./AmazonPayButton";

// Per request (env and the listener's token), on Node: the Amazon Pay SDK signs with node:crypto.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

const withToken = (path: string, token: string | undefined) => (token ? `${path}${path.includes("?") ? "&" : "?"}t=${encodeURIComponent(token)}` : path);

export default async function GivePage({ searchParams }: PageProps<"/give">) {
  const params = await searchParams;
  const tierId = one(params.tier);
  const token = one(params.t);
  const tier = tierById(tierId);
  if (tierId && !tier) notFound();
  const env = giveEnv();
  if (!env) return <NotSetUp />;
  if (!tier) return <ChooseLevel token={token} />;
  const choice = chooseGift(tier, one(params.gift), one(params.size));
  if (typeof choice === "string") return <ChooseGift tier={tier} token={token} invalid={choice === "invalid"} />;

  const listenerId = openListener(token, env.tokenSecret);
  const config = await signedButton(env, tier, choice, await checkoutUrl(env, tier, choice, listenerId));
  if (!config) return <NotSetUp />;
  return (
    <>
      <h1>{tier.kind === "monthly" ? `${dollars(tier.amount)} every month` : `${dollars(tier.amount)} one time`} to Radio Milwaukee</h1>
      <p>{tier.level}. Today: {`$${tier.amount}`}. No fees added.{tier.kind === "monthly" ? " Cancel any time by voice or at pay.amazon.com." : ""}</p>
      <GiftSummary tier={tier} choice={choice} token={token} />
      {token && !listenerId && <p className="muted">This link has expired, so this gift won&rsquo;t be linked to your Alexa account. You can still give.</p>}
      <AmazonPayButton config={config} />
      <p className="muted"><a href={withToken("/give", token)}>Choose a different level</a></p>
    </>
  );
}

/**
 * Where Amazon sends the buyer: the thanks page, or for a shipped gift the review step first. Fresh, longer tokens ride
 * in the signed URL so the listener and the gift choice are still known on the way back, and can't be edited.
 */
async function checkoutUrl(env: GiveEnv, tier: Tier, choice: GiftChoice, listenerId: string | null) {
  const shipped = ships(tier, choice);
  const url = new URL(shipped ? "/give/review" : "/give/thanks", returnOrigin(await headers()));
  url.searchParams.set("tier", tier.id);
  url.searchParams.set("g", sealGift(tier, choice, env.tokenSecret, RETURN_LINK_TTL_MS));
  if (listenerId) url.searchParams.set("t", sealListener(listenerId, env.tokenSecret, RETURN_LINK_TTL_MS));
  return url.href;
}

// A malformed key fails here, at signing; the page then says giving isn't set up instead of crashing.
async function signedButton(env: GiveEnv, tier: Tier, choice: GiftChoice, url: string) {
  try {
    return buttonConfig(await payClientFrom(env), env, tier, url, ships(tier, choice));
  } catch {
    console.error(JSON.stringify({ event: "give_button_sign_failed" }));
    return null;
  }
}

function GiftSummary({ tier, choice, token }: { tier: Tier; choice: GiftChoice; token: string | undefined }) {
  const premium = premiumFor(tier);
  if (!premium.shipped) return <p>Your thank-you: the {premium.name}.</p>;
  const change = <a href={withToken(`/give?tier=${tier.id}`, token)}>Change</a>;
  if (!choice.gift) return <p>No gift — all of it goes to the station. {change}</p>;
  return <p>Your thank-you: {premium.name}{choice.size ? ` (${choice.size})` : ""}. Amazon Pay will ask where to ship it. {change}</p>;
}

/** Gift or no gift, and a size. A plain form (no script); the server checks the answer against the gift list. */
function ChooseGift({ tier, token, invalid }: { tier: Tier; token: string | undefined; invalid: boolean }) {
  const premium = premiumFor(tier);
  return (
    <>
      <h1>{tier.level}: {tierLabel(tier)}</h1>
      <form method="get" action="/give">
        <input type="hidden" name="tier" value={tier.id} />
        {token && <input type="hidden" name="t" value={token} />}
        <fieldset>
          <legend>Your thank-you gift</legend>
          <label className="choice"><input type="radio" name="gift" value="yes" defaultChecked /> {premium.line}</label>
          {premium.sized && (
            <label className="choice">
              T-shirt size
              <select name="size" defaultValue="">
                <option value="" disabled>Choose a size</option>
                {SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          )}
          <label className="choice"><input type="radio" name="gift" value="no" /> No gift — all of it goes to the station</label>
        </fieldset>
        {invalid && <p className="error" role="alert">Choose a t-shirt size, or pick &ldquo;No gift&rdquo;.</p>}
        <button type="submit">Continue</button>
      </form>
      <p className="muted"><a href={withToken("/give", token)}>Choose a different level</a></p>
    </>
  );
}

function NotSetUp() {
  return (
    <>
      <h1>Donations aren&rsquo;t set up yet</h1>
      <p>You can support Radio Milwaukee at <a href="https://radiomilwaukee.org">radiomilwaukee.org</a>.</p>
    </>
  );
}

function ChooseLevel({ token }: { token: string | undefined }) {
  const link = (tier: Tier | undefined) => tier && (
    <li key={tier.id}><a href={withToken(`/give?tier=${tier.id}`, token)}>{tier.level}: {tierLabel(tier)}<br /><small className="muted">{premiumFor(tier).line}</small></a></li>
  );
  return (
    <>
      <h1>Support Radio Milwaukee</h1>
      <h2>Monthly</h2>
      <ul className="levels">{LEVELS.map((level) => link(tierById(`${level.slug}-monthly`)))}</ul>
      <h2>One time</h2>
      <ul className="levels">{LEVELS.map((level) => link(tierById(`${level.slug}-once`)))}</ul>
      <p className="muted">More levels on radiomilwaukee.org.</p>
    </>
  );
}
