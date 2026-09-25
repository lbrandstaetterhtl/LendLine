import { useTerms } from "../branding/BrandingContext";
import { PageHeader } from "../components/ui";
import { useI18n } from "../i18n";
import { goShortcuts } from "../shortcuts";
import { useCanOpen } from "../ui/UiContext";

/**
 * Keys as written in the tables: "+" joins keys pressed together, " | " separates alternatives, " >
 * " keys pressed one after the other. Key names come from the dictionary (m.help.keys).
 */
function Keys({ children }: { children: string }) {
  const { m } = useI18n();
  const names = m.help.keys as Record<string, string>;
  const seen = new Map<string, number>();
  const parts = children.split(/(\+| \| | > )/).map((part) => {
    const count = (seen.get(part) ?? 0) + 1;
    seen.set(part, count);
    return { part, key: `${part}#${count}`, separator: /^(\+| \| | > )$/.test(part) };
  });
  const separator = (token: string) =>
    token === "+" ? "+" : token === " | " ? ` ${m.help.or} ` : `, ${m.help.andThen} `;
  return (
    <span className="keys">
      {parts.map(({ part, key, separator: isSeparator }) =>
        isSeparator ? (
          <span key={key}>{separator(part)}</span>
        ) : (
          <kbd key={key}>{names[part] ?? part}</kbd>
        )
      )}
    </span>
  );
}

function KeyTable({ caption, rows }: { caption: string; rows: [string, string][] }) {
  const { m } = useI18n();
  return (
    <div className="table-wrap">
      <table className="key-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{m.help.key}</th>
            <th scope="col">{m.help.effect}</th>
          </tr>
        </thead>
        <tbody>
          {/* Keys repeat (Tab, arrows) but every effect is different. */}
          {rows.map(([keys, effect]) => (
            <tr key={effect}>
              <td>
                <Keys>{keys}</Keys>
              </td>
              <td>{effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HelpPage() {
  const openable = useCanOpen();
  const { m } = useI18n();
  const terms = useTerms();
  const h = m.help;
  const pages = goShortcuts.filter((shortcut) => openable(shortcut.to));

  return (
    <>
      <PageHeader title={h.title} description={h.description} />

      <section className="help-section" aria-labelledby="help-pointer">
        <h2 id="help-pointer">{h.pointerTitle}</h2>
        <ul className="help-list">
          {h.pointer.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </section>

      <section className="help-section" aria-labelledby="help-basics">
        <h2 id="help-basics">{h.basicsTitle}</h2>
        <KeyTable
          caption={h.basicsCaption}
          rows={[
            ["Tab", h.basics.tab],
            ["Shift+Tab", h.basics.shiftTab],
            ["Enter", h.basics.enter],
            ["Space", h.basics.space],
            ["Esc", h.basics.esc],
            ["Up | Down", h.basics.upDown],
            ["Tab", h.basics.skip],
          ]}
        />
        <p className="hint">{h.basicsHint}</p>
      </section>

      <section className="help-section" aria-labelledby="help-shortcuts">
        <h2 id="help-shortcuts">{h.shortcutsTitle}</h2>
        <p>{h.shortcutsIntro}</p>
        <KeyTable
          caption={h.shortcutsTitle}
          rows={[
            ["?", h.shortcuts.help],
            ["/", h.shortcuts.search],
            ["n", h.shortcuts.create],
            ["g > Letter", h.shortcuts.go],
            ["Ctrl+Enter", h.shortcuts.save],
          ]}
        />
      </section>

      <section className="help-section" aria-labelledby="help-pages">
        <h2 id="help-pages">{h.pagesTitle}</h2>
        <p>{h.pagesIntro}</p>
        <KeyTable
          caption={h.pagesCaption}
          rows={pages.map((shortcut) => [`g > ${shortcut.key}`, shortcut.label(m, terms)])}
        />
      </section>

      <section className="help-section" aria-labelledby="help-calendar">
        <h2 id="help-calendar">{h.calendarTitle}</h2>
        <p>{h.calendarIntro}</p>
        <KeyTable
          caption={h.calendarCaption}
          rows={[
            ["Left | Right", h.calendar.day],
            ["Up | Down", h.calendar.week],
            ["Home | End", h.calendar.weekEnds],
            ["PageUp | PageDown", h.calendar.month],
            ["Enter", h.calendar.choose],
            ["Left | Right", h.calendar.images],
          ]}
        />
      </section>
    </>
  );
}
