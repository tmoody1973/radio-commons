import { LANDING } from "@/lib/landing";
import styles from "./landing.module.css";

// The three sections added Oct 6 (approved mockup: canvas "Radio Commons Echo Show cards", Proposed rows).

const Arrow = ({ head = true }: { head?: boolean }) => (
  <svg width="36" height="20" viewBox="0 0 36 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={head ? "M2 10h30M24 3l8 7-8 7" : "M2 10h30"} />
  </svg>
);
const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
);

export function AlsoRow() {
  return (
    <div className={styles.stack}>
      <p className={styles.label}>Also on Alexa+</p>
      <div className={styles.cols4}>
        {LANDING.also.map((t) => (
          <article key={t.title} className={`${styles.card} ${styles.tile}`}>
            <p className={styles.stepTitle}>{t.title}</p>
            <p className={styles.tileSay}>{t.say}</p>
            <p className={styles.small}>{t.does}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function Journey() {
  const L = LANDING;
  return (
    <section id="conversation" className={`${styles.wrap} ${styles.section}`}>
      <div className={styles.intro}>
        <h2 className={styles.h2}>{L.journeyHeadline}</h2>
        <p className={styles.sub}>{L.journeySub}</p>
      </div>
      <div className={styles.journey}>
        <div className={styles.today}>
          <p className={styles.kicker}>Today</p>
          <span className={styles.fakePlay}><PlayIcon /> Play 88Nine</span>
          <p className={styles.body}>{L.journeyToday}</p>
        </div>
        <div className={styles.stack}>
          <p className={styles.label}>With Radio Commons</p>
          <ol className={styles.turns}>
            {L.journey.map((t, i) => (
              <li key={t.tool} className={styles.turn}>
                <span className={styles.num} aria-hidden="true">{i + 1}</span>
                <div className={styles.turnSay}>
                  <p className={styles.tileSay}>{t.say}</p>
                  <code className={styles.code}>{t.tool}</code>
                </div>
                <p className={styles.small}>{t.systems}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className={styles.stack}>
        <p className={styles.stepTitle}>Everything Alexa+ can call</p>
        <p className={styles.small}>Grouped by what a listener wants. Checked against the server on every build, so it&rsquo;s always complete.</p>
        <div className={styles.cols3}>
          {L.toolGroups.map((g) => (
            <article key={g.name} className={`${styles.card} ${styles.tile}`}>
              <p className={styles.stepTitle}>{g.name}</p>
              <ul className={styles.chips}>
                {g.tools.map((tool) => <li key={tool}><code className={styles.chip}>{tool}</code></li>)}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Architecture() {
  const A = LANDING.arch;
  return (
    <figure className={styles.figure}>
      <div className={styles.arch} role="img" aria-label={A.label}>
        <div className={`${styles.archBox} ${styles.aCds}`}>
          <p className={styles.kicker}>Already had</p>
          <p className={styles.archTitle}>{A.cds.title}</p>
          <p className={styles.small}>{A.cds.text}</p>
        </div>
        <div className={`${styles.archArrow} ${styles.aA1}`}><Arrow /></div>
        <div className={`${styles.archDark} ${styles.aBs}`}>
          <div className={styles.archHead}>
            <p className={styles.archTitle}>Backstory</p>
            <span className={styles.newTag}>NEW</span>
          </div>
          <ol className={styles.archSteps}>
            {A.backstorySteps.map((step, i) => <li key={step}>{i + 1} · {step}</li>)}
          </ol>
        </div>
        <div className={`${styles.archArrow} ${styles.aA2}`}><Arrow /></div>
        <div className={`${styles.archBox} ${styles.aOth}`}>
          <p className={styles.kicker}>Already had</p>
          {A.sources.map((src) => <p key={src} className={styles.archSource}>{src}</p>)}
        </div>
        <div className={`${styles.archArrow} ${styles.aA4}`}><Arrow head={false} /></div>
        <div className={`${styles.archDash} ${styles.aDir}`} />
        <div className={`${styles.archArrow} ${styles.aA5}`}><Arrow /></div>
        <div className={`${styles.archMcp} ${styles.aMcp}`}>
          <p className={styles.label}>The track&rsquo;s tool</p>
          <p className={styles.archTitle}>Radio Commons MCP server</p>
          <p className={styles.small}>{A.mcpText}</p>
        </div>
        <div className={`${styles.archArrow} ${styles.aA3}`}><Arrow /></div>
        <div className={`${styles.archDark} ${styles.aAlexa}`}>
          <svg width="44" height="36" viewBox="0 0 44 36" fill="none" stroke="#F7941D" strokeWidth="2.5" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="40" height="26" rx="4" /><path d="M14 34h16" /></svg>
          <p className={styles.archTitle}>Alexa+</p>
          <p className={styles.archNote}>Voice, and Echo Show screens</p>
        </div>
      </div>
      <figcaption className={styles.small}>{A.caption}</figcaption>
    </figure>
  );
}
