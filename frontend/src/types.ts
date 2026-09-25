export type Role = "USER" | "ADMIN";
export type DeviceStatus = "AVAILABLE" | "BORROWED" | "DEFECTIVE";
export type RequestStatus = "OPEN" | "APPROVED" | "REJECTED" | "RETURNED";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  /**
   * The password was set by an admin; the app sends the person to "Mein Konto" first.
   */
  mustChangePassword: boolean;
  authSource: "LOCAL" | "LDAP";
};

export type Device = {
  id: string;
  name: string;
  categoryId: string;
  category: string;
  description: string;
  quantityTotal: number;
  quantityAvailable: number;
  quantityBorrowed?: number;
  units?: { id: string; serialNumber: string; status: DeviceStatus }[];
  images: { id: string; url: string }[];
  createdAt: string;
  updatedAt: string;
};

export type BorrowRequest = {
  id: string;
  userId: string;
  deviceId: string;
  status: RequestStatus;
  requestedAt: string;
  startsAt: string;
  desiredUntil: string;
  approvedAt: string | null;
  returnedAt: string | null;
  comment: string;
  rejectionReason: string;
  user: { id: string; name: string; email: string };
  room?: { id: string; name: string; building: string };
  device: {
    id: string;
    name: string;
    category: string;
    serialNumber: string;
    status: DeviceStatus;
  };
};

export const deviceStatusLabel: Record<DeviceStatus, string> = {
  AVAILABLE: "Verfügbar",
  BORROWED: "Ausgeliehen",
  DEFECTIVE: "Defekt",
};

export const requestStatusLabel: Record<RequestStatus, string> = {
  OPEN: "Offen",
  APPROVED: "Bestätigt",
  REJECTED: "Abgelehnt",
  RETURNED: "Zurückgegeben",
};

/**
 * A period as entered in `<input type="datetime-local">` (`YYYY-MM-DDTHH:MM`).
 */
export type Period = { startsAt: string; desiredUntil: string };

/**
 * Formats a date for `<input type="datetime-local">` (`YYYY-MM-DDTHH:MM`, local time).
 */
export function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDate(value: string | null): string {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}
