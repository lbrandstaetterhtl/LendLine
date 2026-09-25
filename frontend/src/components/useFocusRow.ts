import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * `?focus=<id>` from a link on the overview: scrolls to the row `row-<id>` once it exists and
 * returns the id, so the row can be highlighted.
 */
export function useFocusRow(): string | null {
  const [params] = useSearchParams();
  const focus = params.get("focus");

  useEffect(() => {
    if (!focus) return undefined;
    // The list loads after the page mounts; try until the row appears (at most ~3 s).
    let tries = 0;
    const timer = window.setInterval(() => {
      const row = document.getElementById(`row-${focus}`);
      tries += 1;
      if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
      if (row || tries > 30) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [focus]);

  return focus;
}
