import { Link } from "react-router-dom";

import { useI18n } from "../i18n";
import { Alert } from "./ui";

/**
 * Page-level confirmation after a request, with the way to follow it up.
 */
export function RequestSent({ message }: { message: string }) {
  const { m } = useI18n();
  return (
    <Alert tone="ok">
      {message && (
        <>
          {message} <Link to="/my-requests">{m.misc.toMyRequests}</Link>
        </>
      )}
    </Alert>
  );
}
