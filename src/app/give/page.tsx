import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { RETURN_LINK_TTL_MS } from "@/lib/give";
import { buttonConfig, giveEnv, payClientFrom, returnOrigin, type GiveEnv } from "@/lib/give/amazonPay";
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

  const listenerId = openListener(token, env.tokenSecret);
  // A fresh, longer token rides in the signed return URL, so the listener is still known when Amazon sends them back.
  const returnToken = listenerId ? sealListener(listenerId, env.tokenSecret, RETURN_LINK_TTL_MS) : undefined;
  const returnUrl = withToken(`${returnOrigin(await headers())}/give/thanks?tier=${encodeURIComponent(tier.id)}`, returnToken);
  const config = await signedButton(env, tier, returnUrl);
  if (!config) return <NotSetUp />;
  return (
    <>
      <h1>{tier.kind === "monthly" ? `${dollars(tier.amount)} every month` : `${dollars(tier.amount)} one time`} to Radio Milwaukee</h1>
      <p>{tier.level}. Today: {`$${tier.amount}`}. No fees added.{tier.kind === "monthly" ? " Cancel any time by voice or at pay.amazon.com." : ""}</p>
      {token && !listenerId && <p className="muted">This link has expired, so this gift won&rsquo;t be linked to your Alexa account. You can still give.</p>}
      <AmazonPayButton config={config} />
      <p className="muted"><a href={withToken("/give", token)}>Choose a different level</a></p>
    </>
  );
}

// A malformed key fails here, at signing; the page then says giving isn't set up instead of crashing.
async function signedButton(env: GiveEnv, tier: Tier, returnUrl: string) {
  try {
    return buttonConfig(await payClientFrom(env), env, tier, returnUrl);
  } catch {
    console.error(JSON.stringify({ event: "give_button_sign_failed" }));
    return null;
  }
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
  const link = (tier: Tier | undefined) => tier && <li key={tier.id}><a href={withToken(`/give?tier=${tier.id}`, token)}>{tier.level}: {tierLabel(tier)}</a></li>;
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
