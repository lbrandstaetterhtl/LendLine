import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/ui";
import { goShortcuts } from "../shortcuts";

function Keys({ children }: { children: string }) {
  // "Strg+Enter" → <kbd>Strg</kbd>+<kbd>Enter</kbd>; "g, dann s" keeps its words.
  const parts = children.split(/(\+|, dann | oder )/);
  return (
    <span className="keys">
      {/* Separators sit at odd positions; every part of one entry is distinct. */}
      {parts.map((part, position) =>
        position % 2 === 1 ? <span key={part}>{part}</span> : <kbd key={part}>{part}</kbd>
      )}
    </span>
  );
}

function KeyTable({ caption, rows }: { caption: string; rows: [string, string][] }) {
  return (
    <div className="table-wrap">
      <table className="key-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Taste</th>
            <th scope="col">Wirkung</th>
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
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const pages = goShortcuts.filter((shortcut) => isAdmin || !shortcut.admin);

  return (
    <>
      <PageHeader
        title="Bedienung"
        description="LendLine lässt sich vollständig mit Maus, Touchpad oder nur mit der Tastatur bedienen. Diese Seite öffnen Sie jederzeit mit der Taste ?."
      />

      <section className="help-section" aria-labelledby="help-pointer">
        <h2 id="help-pointer">Maus und Touchpad</h2>
        <ul className="help-list">
          <li>
            Alles, was etwas auslöst, ist eine Schaltfläche oder ein Link: Der Zeiger wird zur Hand,
            und die Fläche hebt sich beim Überfahren ab. Klickflächen sind mindestens 32 Pixel hoch,
            damit sie auch mit dem Touchpad sicher zu treffen sind.
          </li>
          <li>
            Bearbeiten-Fenster öffnen sich rechts am Rand. Die Schaltflächen zum Speichern und
            Abbrechen stehen immer unten im Fenster, auch bei langen Formularen.
          </li>
          <li>
            Fehlermeldungen erscheinen oben im Fenster; LendLine scrollt automatisch dorthin, wenn
            Sie gerade weiter unten sind.
          </li>
          <li>
            Suche: „Anfragen“ öffnet das Formular mit dem gesuchten Zeitraum, „Im Kalender ansehen“
            die Belegung. Im Kalender öffnet ein Klick auf einen freien Tag die Anfrage für diesen
            Tag (8–17 Uhr); belegte Tage zeigen beim Überfahren ihren Status. Alles bleibt in einem
            Fenster, nach dem Senden führt ein Link zu „Meine Anfragen“.
          </li>
          <li>Tastenkürzel zu den Menüpunkten zeigt ein kurzer Halt mit dem Zeiger darüber.</li>
        </ul>
      </section>

      <section className="help-section" aria-labelledby="help-basics">
        <h2 id="help-basics">Tastatur: Grundlagen</h2>
        <KeyTable
          caption="Grundlegende Tasten"
          rows={[
            ["Tab", "Zum nächsten Bedienelement. Der Fokus ist als blauer Rahmen sichtbar."],
            ["Umschalt+Tab", "Zum vorherigen Bedienelement."],
            ["Enter", "Link öffnen, Schaltfläche auslösen, Formular absenden."],
            ["Leertaste", "Schaltfläche auslösen, Kontrollkästchen umschalten."],
            ["Esc", "Fenster oder Menü schließen, ohne zu speichern."],
            [
              "Pfeil hoch oder Pfeil runter",
              "In Auswahllisten (z. B. Kategorie, Raum) den Eintrag wechseln.",
            ],
            ["Tab", "Direkt nach dem Laden: „Zum Inhalt springen“ überspringt die Seitenleiste."],
          ]}
        />
        <p className="hint">
          Nach jedem Seitenwechsel steht der Fokus auf der Überschrift der neuen Seite; mit Tab geht
          es im Inhalt weiter.
        </p>
      </section>

      <section className="help-section" aria-labelledby="help-shortcuts">
        <h2 id="help-shortcuts">Tastenkürzel</h2>
        <p>Die Kürzel wirken nicht, solange Sie in ein Eingabefeld schreiben.</p>
        <KeyTable
          caption="Tastenkürzel"
          rows={[
            ["?", "Diese Seite öffnen."],
            ["/", "Zum Suchfeld der Seite springen (Suche, Gerätekatalog, Protokoll)."],
            [
              "n",
              "Neuen Eintrag anlegen (Geräte, Räume, Benutzer; bei Kategorien ins Namensfeld).",
            ],
            ["g, dann Buchstabe", "Zu einer Seite springen, siehe Tabelle unten."],
            ["Strg+Enter", "Im geöffneten Fenster speichern, auch aus einem Textfeld heraus."],
          ]}
        />
      </section>

      <section className="help-section" aria-labelledby="help-pages">
        <h2 id="help-pages">Seiten direkt öffnen</h2>
        <p>
          Erst <kbd>g</kbd> drücken, dann innerhalb von etwa einer Sekunde den Buchstaben.
        </p>
        <KeyTable
          caption="Seiten mit g und Buchstabe"
          rows={pages.map((shortcut) => [`g, dann ${shortcut.key}`, shortcut.label])}
        />
      </section>

      <section className="help-section" aria-labelledby="help-calendar">
        <h2 id="help-calendar">Kalender und Bilder</h2>
        <p>
          Der Kalender ist ein einziger Tab-Stopp. Innerhalb des Kalenders bewegen Sie sich mit den
          Pfeiltasten; auch belegte Tage lassen sich ansteuern, damit ihr Status vorgelesen wird.
        </p>
        <KeyTable
          caption="Tasten im Kalender und in der Bildansicht"
          rows={[
            ["Pfeil links oder Pfeil rechts", "Einen Tag zurück oder vor."],
            ["Pfeil hoch oder Pfeil runter", "Eine Woche zurück oder vor."],
            ["Pos1 oder Ende", "Montag oder Sonntag der Woche."],
            ["Bild auf oder Bild ab", "Einen Monat zurück oder vor."],
            ["Enter", "Freien Tag wählen und die Anfrage öffnen."],
            ["Pfeil links oder Pfeil rechts", "In der Bildansicht: vorheriges oder nächstes Bild."],
          ]}
        />
      </section>
    </>
  );
}
