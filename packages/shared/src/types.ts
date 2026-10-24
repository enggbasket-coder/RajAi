export type Role = "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";
export type ManagementChannel = "WEB" | "WHATSAPP" | "TELEGRAM";
export type AssignmentChannelPreference = "WHATSAPP" | "TELEGRAM" | "BOTH" | "DEFAULT";
export type MessagingProviderType = "WHATSAPP" | "TELEGRAM";
export type DeliveryChannel = "WHATSAPP" | "TELEGRAM" | "WEB";
export type DeliveryStatus = "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED";
export type AssignmentStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
export type TaskStatus = "DRAFT" | "ASSIGNED" | "ACCEPTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type ProjectStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
export type TimeSource = "WEB" | "DESKTOP" | "MANUAL" | "MOBILE";
export type TimeEntryStatus = "RECORDED" | "SUBMITTED" | "APPROVED" | "REJECTED";
export type TimesheetStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageType = "TEXT" | "TEMPLATE" | "BUTTON" | "CALLBACK" | "SYSTEM";
export type SendVia = "PREFERENCE" | "WHATSAPP" | "TELEGRAM" | "BOTH" | "WEB";

/** Send-via option chosen on the assign screen. */
export const SEND_VIA_OPTIONS: { value: SendVia; label: string }[] = [
  { value: "PREFERENCE", label: "Employee preference" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "BOTH", label: "Both" },
  { value: "WEB", label: "Web only" },
];

export const ROLE_RANK: Record<Role, number> = { OWNER: 4, ADMIN: 3, MANAGER: 2, EMPLOYEE: 1 };
