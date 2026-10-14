import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats a Date or timestamp string into accurate Nigerian West Africa Time (WAT / UTC+1).
 * e.g., "6:41 AM"
 */
export function formatToWAT(dateInput?: string | Date | number | null): string {
  if (!dateInput) return "";
  try {
    const d = new Date(dateInput);
    return d.toLocaleTimeString("en-US", {
      timeZone: "Africa/Lagos",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

/**
 * Formats a Date or timestamp string into full Nigerian West Africa Time (WAT / UTC+1).
 * e.g., "Oct 14, 6:41 AM"
 */
export function formatDateTimeWAT(dateInput?: string | Date | number | null): string {
  if (!dateInput) return "";
  try {
    const d = new Date(dateInput);
    return d.toLocaleString("en-US", {
      timeZone: "Africa/Lagos",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

/**
 * Returns current Nigerian time object with hour, formatted string, and date.
 */
export function getNigerianTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", {
    timeZone: "Africa/Lagos",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const dateStr = now.toLocaleDateString("en-US", {
    timeZone: "Africa/Lagos",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const hourParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lagos",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = parseInt(hourParts.find((p) => p.type === "hour")?.value || "0", 10);

  return { hour, timeStr, dateStr };
}
