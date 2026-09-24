import type { DeviceStatus, RequestStatus } from "../types";

import { deviceStatusLabel, requestStatusLabel } from "../types";

export function DeviceBadge({ status }: { status: DeviceStatus }) {
  return <span className={`badge st-${status.toLowerCase()}`}>{deviceStatusLabel[status]}</span>;
}

export function RequestBadge({ status }: { status: RequestStatus }) {
  return <span className={`badge st-${status.toLowerCase()}`}>{requestStatusLabel[status]}</span>;
}
