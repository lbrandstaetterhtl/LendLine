export type Role = "USER" | "ADMIN";
export type DeviceStatus = "AVAILABLE" | "BORROWED" | "DEFECTIVE";
export type RequestStatus = "OPEN" | "APPROVED" | "REJECTED" | "RETURNED" | "CANCELLED";

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
  cancelledAt?: string | null;
  /**
   * Answers to the company's own form fields, with the labels they had at the time.
   */
  fields?: { label: string; value: string }[];
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
  CANCELLED: "Zurückgezogen",
};

/**
 * A period as entered in `<input type="datetime-local">` (`YYYY-MM-DDTHH:MM`).
 */
export type Period = { startsAt: string; desiredUntil: string };

export type FormFieldMode = "required" | "optional" | "hidden";

export type FormField = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox";
  required: boolean;
  options: string[];
  hint: string;
};

/**
 * The company's request form (GET /api/settings/request-form).
 */
export type RequestForm = {
  room: FormFieldMode;
  comment: FormFieldMode;
  commentLabel: string;
  commentHint: string;
  fields: FormField[];
  maxDays: number;
  autoApprove: boolean;
};

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
