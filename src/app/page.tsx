import type { Metadata } from "next";
import Image from "next/image";
import { Figtree } from "next/font/google";
import { LANDING } from "@/lib/landing";
import styles from "./landing.module.css";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Radio Commons — your local station, inside Alexa+",
  description: LANDING.lead,
  openGraph: { title: "Radio Commons", description: LANDING.lead, images: ["/landing/story.jpg"] },
};

const Mic = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
const Play = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
);
const Check = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
);

export default function Home() {
  const L = LANDING;
  return (
    <div className={`${styles.page} ${figtree.className}`}>
      <header className={styles.dark}>
        <div className={`${styles.wrap} ${styles.bar}`}>
          <a href="#top" className={styles.brand}>Radio Commons</a>
          <nav aria-label="Page" className={styles.nav}>
            <a href="#ask">What to ask</a>
            <a href="#why">Why</a>
            <a href="#how">How it works</a>
            <a href="#stations">For stations</a>
            <a href={L.links.judges}>For judges</a>
          </nav>
        </div>
        <section id="top" className={`${styles.wrap} ${styles.hero}`}>
          <div className={styles.stack}>
            <p className={styles.eyebrow}>{L.eyebrow}</p>
            <h1 className={styles.h1}>{L.headline}</h1>
            <p className={styles.lead}>{L.lead}</p>
            <div className={styles.buttons}>
              <a href={L.links.simulator} className={styles.primary}><Mic /> Try the simulator</a>
              {L.demoVideoUrl ? <a href="#demo" className={styles.secondaryDark}><Play /> Watch the demo</a> : null}
            </div>
            <p className={styles.note}>{L.note}</p>
          </div>
          <div className={styles.device}>
            <Image src="/landing/story.jpg" alt={L.pillars[0].alt} width={1400} height={639} priority className={styles.deviceScreen} />
          </div>
        </section>
      </header>

      <main>
        <section id="ask" className={`${styles.wrap} ${styles.section}`}>
          <div className={styles.intro}>
            <h2 className={styles.h2}>Ask what you half-remember.</h2>
            <p className={styles.sub}>Three things a listener can do today, on an Echo Show or by voice alone.</p>
          </div>
          <div className={styles.cols3}>
            {L.pillars.map((p) => (
              <article key={p.label} className={styles.card}>
                <Image src={p.image} alt={p.alt} width={1400} height={639} className={styles.shot} />
                <p className={styles.label}>{p.label}</p>
                <p className={styles.ask}>{p.ask}</p>
                <p className={styles.body}>{p.does}</p>
              </article>
            ))}
          </div>
        </section>

        {L.demoVideoUrl ? (
          <section id="demo" className={styles.dark}>
            <div className={`${styles.wrap} ${styles.section} ${styles.center}`}>
              <h2 className={styles.h2}>See it in two minutes</h2>
              <video className={styles.video} src={L.demoVideoUrl} controls preload="metadata" />
            </div>
          </section>
        ) : null}

        <section id="why" className={`${styles.wrap} ${styles.section}`}>
          <h2 className={`${styles.h2} ${styles.narrow}`}>{L.whyHeadline}</h2>
          <div className={styles.stats}>
            {L.stats.map((s) => (
              <div key={s.value} className={styles.stack}>
                <p className={styles.stat}>{s.value}</p>
                <p className={styles.body}>{s.text}</p>
              </div>
            ))}
            <div className={styles.card}>
              <p className={styles.ask}>{L.claim}</p>
              <p className={styles.body}>{L.claimDetail}</p>
              <a href={L.links.research} className={styles.link}>Read the research</a>
            </div>
          </div>
        </section>

        <section id="how" className={styles.white}>
          <div className={`${styles.wrap} ${styles.section}`}>
            <h2 className={styles.h2}>How it works</h2>
            <ol className={styles.cols4}>
              {L.steps.map((s, i) => (
                <li key={s.title} className={styles.step}>
                  <span className={styles.num} aria-hidden="true">{i + 1}</span>
                  <p className={styles.stepTitle}>{s.title}</p>
                  <p className={styles.body}>{s.text}</p>
                </li>
              ))}
            </ol>
            <ul className={styles.cols4}>
              {L.rules.map((r) => <li key={r} className={styles.rule}><Check /><span>{r}</span></li>)}
            </ul>
          </div>
        </section>

        <section id="stations" className={`${styles.wrap} ${styles.section}`}>
          <h2 className={styles.h2}>Built for any public radio station.</h2>
          <div className={styles.cols3}>
            {L.stations.map((s) => (
              <div key={s.title} className={styles.stack}>
                <p className={styles.stepTitle}>{s.title}</p>
                <p className={styles.body}>{s.text}</p>
              </div>
            ))}
          </div>
          <a href={L.links.github} className={styles.darkButton}>View the code on GitHub</a>
        </section>
      </main>

      <footer className={styles.dark}>
        <div className={`${styles.wrap} ${styles.footer}`}>
          <span>{L.footer}</span>
          <span>Stories from Backstory · Events from the MKE Field Guide</span>
        </div>
      </footer>
    </div>
  );
}
