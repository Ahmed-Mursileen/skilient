"use client";

import { useEffect } from "react";
import { postAuthMessage } from "@/lib/auth/channel";

/** Tells the "Check your inbox" tab in this browser that the email is confirmed. */
export function ConfirmedBroadcast() {
  useEffect(() => {
    postAuthMessage("confirmed");
  }, []);
  return null;
}
