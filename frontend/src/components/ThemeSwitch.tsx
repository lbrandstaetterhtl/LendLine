import type { ThemeChoice } from "../theme";
import type { IconName } from "./icons";

import { useState } from "react";

import { applyTheme, readTheme } from "../theme";
import { Icon } from "./icons";

const options: { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: "system", label: "Wie System", icon: "monitor" },
  { value: "light", label: "Hell", icon: "sun" },
  { value: "dark", label: "Dunkel", icon: "moon" },
];

export function ThemeSwitch() {
  const [choice, setChoice] = useState(readTheme);

  function choose(next: ThemeChoice) {
    applyTheme(next);
    setChoice(next);
  }

  return (
    <fieldset className="theme-switch">
      <legend className="sr-only">Darstellung</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={choice === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => choose(option.value)}
        >
          <Icon name={option.icon} />
        </button>
      ))}
    </fieldset>
  );
}
