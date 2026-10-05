import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import Link from "next/link";
import { HOW_IT_WORKS } from "@/lib/howItWorks";
import { LANDING } from "@/lib/landing";
import styles from "../landing.module.css";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "How it works — Radio Commons for Alexa+ judges",
  description: HOW_IT_WORKS.lead,
};

const H = HOW_IT_WORKS;

function Demo() {
  return (
    <section id="demo" aria-labelledby="demo-h" className={`${styles.wrap} ${styles.section}`}>
      <h2 id="demo-h" className={styles.h2}>{H.sections.demo}</h2>
      <div className={styles.cols2}>
        {H.sessions.map((s) => (
          <article key={s.label} className={styles.card}>
            <p className={styles.label}>{s.label}</p>
            <h3 className={styles.ask}>{s.title}</h3>
            <p className={styles.body}>{s.setup}</p>
            <p className={styles.says}>{s.says}</p>
            <blockquote className={styles.reply}>{s.reply}</blockquote>
            <p className={styles.label}>{H.sessionsData}</p>
            <p className={styles.body}>{s.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Flow() {
  return (
    <section id="flow" aria-labelledby="flow-h" className={styles.white}>
      <div className={`${styles.wrap} ${styles.section}`}>
        <div className={styles.intro}>
          <h2 id="flow-h" className={styles.h2}>{H.sections.flow}</h2>
          <p className={styles.sub}>What happens after “save this”, in order.</p>
        </div>
        <ol className={styles.cols5}>
          {H.services.map((s, i) => (
            <li key={s.name} className={styles.step}>
              <span className={styles.num} aria-hidden="true">{i + 1}</span>
              <h3 className={styles.stepTitle}>{s.name}</h3>
              <p className={styles.body}>{s.does}</p>
            </li>
          ))}
        </ol>
        <p className={`${styles.body} ${styles.narrow}`}>{H.flowNote}</p>
      </div>
    </section>
  );
}

function Memory() {
  return (
    <section id="memory" aria-labelledby="memory-h" className={`${styles.wrap} ${styles.section}`}>
      <h2 id="memory-h" className={styles.h2}>{H.sections.memory}</h2>
      <div className={styles.cols2}>
        <ul className={styles.list}>
          {H.remembered.map((r) => (
            <li key={r.what} className={styles.stack}>
              <h3 className={styles.stepTitle}>{r.what}</h3>
              <p className={styles.body}>{r.detail}</p>
            </li>
          ))}
        </ul>
        <div className={styles.card}>
          <p className={styles.ask}>{H.erase}</p>
          <p className={styles.body}>{H.notStored}</p>
          <p className={styles.body}>{H.memoryWhy}</p>
          <a href="/privacy" className={styles.link}>Read the privacy page</a>
        </div>
      </div>
    </section>
  );
}

function Alexa() {
  return (
    <section id="alexa" aria-labelledby="alexa-h" className={styles.white}>
      <div className={`${styles.wrap} ${styles.section}`}>
        <h2 id="alexa-h" className={styles.h2}>{H.sections.alexa}</h2>
        <div className={styles.cols2}>
          {H.alexa.map((a) => (
            <div key={a.title} className={styles.stack}>
              <h3 className={styles.stepTitle}>{a.title}</h3>
              <p className={styles.body}>{a.text}</p>
            </div>
          ))}
        </div>
        <div className={styles.stack}>
          <h3 className={styles.stepTitle}>Limits, plainly</h3>
          <ul className={styles.list}>
            {H.limits.map((l) => <li key={l} className={styles.body}>{l}</li>)}
          </ul>
        </div>
        <div className={styles.buttons}>
          <a href={LANDING.links.simulator} className={styles.primary}>Try the simulator</a>
          <a href={LANDING.links.github} className={styles.darkButton}>View the code on GitHub</a>
        </div>
      </div>
    </section>
  );
}

function Status() {
  return (
    <section id="status" aria-labelledby="status-h" className={`${styles.wrap} ${styles.section}`}>
      <div className={styles.intro}>
        <h2 id="status-h" className={styles.h2}>{H.sections.status}</h2>
        <p className={styles.sub}>As of {H.statusDate}.</p>
      </div>
      <table className={styles.table}>
        <thead><tr><th scope="col">What a listener can do</th><th scope="col">State</th></tr></thead>
        <tbody>
          {H.status.map((s) => (
            <tr key={s.feature}>
              <td>{s.feature}{s.detail ? <span>{s.detail}</span> : null}</td>
              <td className={`${styles.state} ${s.state === "Live" ? styles.live : styles.next}`}>{s.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function HowItWorks() {
  return (
    <div className={`${styles.page} ${figtree.className}`}>
      <header className={styles.dark}>
        <div className={`${styles.wrap} ${styles.bar}`}>
          <Link href="/" className={styles.brand}>Radio Commons</Link>
          <nav aria-label="Page" className={styles.nav}>
            <a href="#demo">The demo</a>
            <a href="#flow">Five services</a>
            <a href="#memory">Memory</a>
            <a href="#alexa">Alexa+</a>
            <a href="#status">Status</a>
          </nav>
        </div>
        <div className={`${styles.wrap} ${styles.section}`}>
          <div className={`${styles.stack} ${styles.narrow}`}>
            <p className={styles.eyebrow}>{H.eyebrow}</p>
            <h1 className={styles.h1}>{H.headline}</h1>
            <p className={styles.lead}>{H.lead}</p>
          </div>
        </div>
      </header>
      <main>
        <Demo />
        <Flow />
        <Memory />
        <Alexa />
        <Status />
      </main>
      <footer className={styles.dark}>
        <div className={`${styles.wrap} ${styles.footer}`}>
          <span>{LANDING.footer}</span>
          <nav aria-label="Footer" className={styles.nav}><Link href="/">Back to the home page</Link></nav>
        </div>
      </footer>
    </div>
  );
}
