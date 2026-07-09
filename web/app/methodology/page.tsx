export const metadata = { title: "How it works | The Second Round" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="reveal mt-8">
      <h2 className="serif text-3xl" style={{ color: "var(--purple-bright)" }}>{title}</h2>
      <div className="mt-2 space-y-3 text-base leading-relaxed" style={{ color: "var(--muted)" }}>
        {children}
      </div>
    </section>
  );
}

export default function HowItWorks() {
  return (
    <article className="mx-auto max-w-prose">
      <h1 className="serif text-4xl">How it works</h1>
      <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--muted)" }}>
        A second opinion on the draft, and an honest one. It knows two things well: what
        players actually did in college, and what history says players who did the same
        things became.
      </p>

      <Section title="What is this?">
        <p>
          I taught a model to study every college prospect since 2009: how they scored,
          passed, defended, and rebounded, how young they were, how big they were, and who
          they did it against. Then I watched what those players actually became in the
          NBA: stars, starters, role players, or guys who washed out.
        </p>
        <p>
          When a new prospect comes along, the model finds what history says about players
          with his profile. It never gives one answer. It gives chances: maybe 60% he
          becomes a starter, 12% he becomes a star, 5% he never sticks. Nobody knows for
          sure which one happens. The model doesn&apos;t pretend to either.
        </p>
      </Section>

      <Section title="Why should anyone trust it?">
        <p>
          I tested it the hard way. For every draft from 2009 to 2021, I hid that class
          from the model, asked it to grade those players using only what was knowable
          before draft night, then checked its answers against real careers.
        </p>
        <p>
          On the average pick, NBA teams beat the model. They should. They have
          workouts, medicals, interviews, and intel I don&apos;t. But when the model
          disagreed loudly with where a player was drafted, it was right far more often
          than chance. Its favorite overlooked players outplayed their draft slots badly,
          and the players it liked least underplayed theirs. The lesson: don&apos;t use
          this to re-rank the whole board. Use it to find the players worth a second look.
        </p>
      </Section>

      <Section title="What I mean by the market">
        <p>
          The market is the draft&apos;s collective opinion: where NBA front offices
          actually pick each player, and where public mock drafts and big boards rank him
          before the night. When I say the market wins on the average pick, I mean
          teams&apos; real choices predicted careers better than the model did. When the
          site shows a pick number or a consensus rank next to a player, that is the
          market&apos;s answer sitting beside the model&apos;s, so you can see exactly
          where they disagree. The model never reads any of it.
        </p>
      </Section>

      <Section title="What the model pays attention to">
        <p>
          The same things a good scout checks on the stat sheet, weighted by what has
          actually predicted careers. Age matters a lot: a 19-year-old and a 23-year-old
          putting up the same numbers are not the same prospect. Free-throw shooting says
          more about a future NBA jumper than college three-point percentage does. Steals
          separate the ones who stick in the league from the ones who don&apos;t. Blocks
          separate ordinary big men from special ones. And production against real
          competition beats production against nobody.
        </p>
        <p>The full list of factors, in plain English:</p>
        <ul className="space-y-1.5">
          <li>
            <strong>Age and body.</strong> Age on draft night, height, wingspan, standing
            reach, vertical leap, sprint and agility times from the combine.
          </li>
          <li>
            <strong>Shooting.</strong> Free-throw percentage, twos and threes, how often he
            shoots from deep, how much of his scoring comes at the rim vs the mid-range,
            dunk rate.
          </li>
          <li>
            <strong>Production and efficiency.</strong> Scoring efficiency, offensive and
            defensive ratings, overall impact numbers, all adjusted for the level of
            competition.
          </li>
          <li>
            <strong>Playmaking and ball security.</strong> Assist rate, turnover rate,
            assist-to-turnover ratio.
          </li>
          <li>
            <strong>Defense and rebounding.</strong> Steal rate, block rate, rebounding on
            both ends.
          </li>
          <li>
            <strong>Track record and trajectory.</strong> Total minutes and games, years in
            college, whether he improved year over year.
          </li>
          <li>
            <strong>Context.</strong> Recruiting rank out of high school, power-conference
            or not, position.
          </li>
        </ul>
        <p>
          Just as important is what it ignores: where the player was drafted, mock drafts,
          and big boards. You will see those numbers all over this site, next to the
          model&apos;s, and that is the point. They are the answer key I grade the model
          against, never its inputs. You cannot grade the room&apos;s opinion if you copied
          off the room.
        </p>
      </Section>

      <Section title="What the model cannot see">
        <p>
          Film. Medicals. Character. Work ethic. How a guy handles coaching. The model
          knows none of that, which is why the lottery is where teams beat it worst, and
          why every player page shows a range instead of a single number. When it says a
          player has a 50% star chance with a range of 26 to 80, it is telling you it has
          real uncertainty. Believe the range.
        </p>
        <p>
          It also only covers players from Division 1 college basketball. International
          prospects show market prices only, with a badge saying so.
        </p>
      </Section>

      <Section title="What the scout notes do">
        <p>
          This is the part built for people who watch the games. Write what you saw:
          &quot;the jumper is real but he floats on defense.&quot; The system reads your
          note, scores it against a fixed checklist of skills, and nudges the player&apos;s
          chances accordingly. Good news nudges them up. Concerns nudge them down.
        </p>
        <p>
          One rule keeps everyone honest: a note is evidence, never a veto. No single
          note, however glowing, can turn a 3% star chance into a 30% one. Your eyes and
          the numbers each get a vote. Neither gets to overrule the other completely.
        </p>
      </Section>

      <Section title="What the war room does">
        <p>
          Every NBA team gets a pick, in order, on draft night. Picking 9th means 8
          players are already gone by the time it&apos;s your turn. The war room lets you
          stand at any pick, 1 through 60, and see who realistically survives that long.
          I ran the draft ten thousand times, letting players rise and slide the way they
          actually do on draft night, including the occasional big fall, and used that to
          estimate the odds each player is still there when your pick comes up. That is
          the conversation a front office wants to have before draft week, not during it.
        </p>
      </Section>

      <Section title="Want the deep end?">
        <p>
          The full technical write-up (the model, the tests, the exact definitions, and
          every design decision with its reasoning) lives in the project repository, along
          with everything needed to reproduce every number on this site.
        </p>
      </Section>
    </article>
  );
}
