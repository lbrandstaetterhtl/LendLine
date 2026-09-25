import { Link } from "react-router-dom";

import { Alert } from "./ui";

/**
 * Page-level confirmation after a request, with the way to follow it up.
 */
export function RequestSent({ message }: { message: string }) {
  return (
    <Alert tone="ok">
      {message && (
        <>
          {message} <Link to="/my-requests">Zu meinen Anfragen</Link>
        </>
      )}
    </Alert>
  );
}
