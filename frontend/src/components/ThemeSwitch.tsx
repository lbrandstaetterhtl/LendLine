import type { ThemeChoice } from "../theme";
import type { IconName } from "./icons";

import { useState } from "react";

import { useI18n } from "../i18n";
import { applyTheme, readTheme } from "../theme";
import { Icon } from "./icons";

const options: { value: ThemeChoice; icon: IconName }[] = [
  { value: "system", icon: "monitor" },
  { value: "light", icon: "sun" },
  { value: "dark", icon: "moon" },
];

export function ThemeSwitch() {
  const [choice, setChoice] = useState(readTheme);
  const { m } = useI18n();

  function choose(next: ThemeChoice) {
    applyTheme(next);
    setChoice(next);
  }

  return (
    <fieldset className="theme-switch">
      <legend className="sr-only">{m.theme.legend}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={choice === option.value}
          aria-label={m.theme[option.value]}
          title={m.theme[option.value]}
          onClick={() => choose(option.value)}
        >
          <Icon name={option.icon} />
        </button>
      ))}
    </fieldset>
  );
}
