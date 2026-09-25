import type { DeviceStatus, RequestStatus } from "../types";

import { useI18n } from "../i18n";

export function DeviceBadge({ status }: { status: DeviceStatus }) {
  const { m } = useI18n();
  return <span className={`badge st-${status.toLowerCase()}`}>{m.status.device[status]}</span>;
}

export function RequestBadge({ status }: { status: RequestStatus }) {
  const { m } = useI18n();
  return <span className={`badge st-${status.toLowerCase()}`}>{m.status.request[status]}</span>;
}
