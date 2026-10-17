"use client";

import { usePathname } from "next/navigation";
import ObeyCustomerCareFloatingWidget from "./ObeyCustomerCareFloatingWidget";

export default function ObeyFloatingChatWrapper() {
  const pathname = usePathname();

  // Hide on admin and control room (they have their own internal tools)
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/control-room")) {
    return null;
  }

  return <ObeyCustomerCareFloatingWidget />;
}
