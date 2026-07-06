export const metadata = { title: "How it works | The Second Round" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="serif text-xl">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>
        {children}
      </div>
    </section>
  );
}

export default function HowItWorks() {
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="serif text-3xl">How it works</h1>
      <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>
        No math degree required. Here is what this thing does, in the same language you
        would use in a film room.
      </p>

      <Section title="What is this?">
        <p>
          It is a second opinion on the draft. We taught a model to study every college
          prospect since 2009: how they scored, passed, defended, and rebounded, how young
          they were, how big they were, and who they did it against. Then we watched what
          those players actually became in the NBA. Stars, starters, role players, or guys
          who washed out.
        </p>
        <p>
          When a new prospect comes along, the model finds what history says about players
          with his profile. It never gives one answer. It gives chances: maybe 60% chance
          he becomes a starter, 12% chance he becomes a star, 5% chance he never sticks.
          That is honest. Nobody knows for sure, so the model does not pretend to.
        </p>
      </Section>

      <Section title="Why should anyone trust it?">
        <p>
          Because we tested it the hard way. For every draft from 2009 to 2021, we hid
          that class from the model, asked it to grade those players using only what was
          knowable before draft night, and then checked its answers against real careers.
        </p>
        <p>
          Here is the honest result: on the average pick, NBA teams beat the model. They
          should. They have workouts, medicals, interviews, and intel we do not. But when
          the model disagreed loudly with where a player was drafted, the model was right
          far more often than chance. Its favorite overlooked players outplayed their
          draft slots badly, and its biggest fades underplayed theirs. The lesson is
          simple: do not use this to re-rank the whole board. Use it to find the players
          worth a second look.
        </p>
      </Section>

      <Section title="What the model pays attention to">
        <p>
          The same things a good scout checks on the stat sheet, weighted by what has
          actually predicted careers. Age matters a lot: a 19-year-old and a 23-year-old
          putting up the same numbers are not the same prospect. Free-throw shooting says
          more about a future NBA jumper than college three-point percentage does. Steals
          tell you who sticks in the league. Blocks tell you which big men become special.
          And production against real competition beats production against nobody.
        </p>
        <p>
          Just as important is what it ignores: where the player was drafted, mock drafts,
          and big boards. The model forms its opinion blind to the market. That is the
          whole point. You cannot grade the room&apos;s opinion if you copied off the room.
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
          Pick a draft slot and see who was realistically still on the board. We ran the
          draft ten thousand times, letting players rise and slide the way they actually
          do on draft night, including the occasional big fall. Standing at pick 9, you
          can see which of the model&apos;s favorite players had a real chance of being
          there. That is the conversation a front office wants to have before draft week,
          not during it.
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
