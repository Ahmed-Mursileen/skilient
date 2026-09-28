import "server-only";

import { cache } from "react";
import { publicImageUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/**
 * Friends, requests and blocks for /friends and profile buttons (PRD 5.8). The read
 * functions work from auth.uid() and only ever return the caller's own relationships.
 */

export interface PersonRow {
  username: string;
  fullName: string;
  department: string | null;
  graduationYear: number | null;
  /** Only where the person's profile is visible to the viewer. */
  avatarUrl: string | null;
}

export interface FriendRequestRow extends PersonRow {
  id: string;
  direction: "received" | "sent";
  createdAt: string;
}

export interface BlockRow {
  username: string;
  fullName: string;
  createdAt: string;
}

export type FriendshipState = "self" | "friends" | "sent" | "received" | "blocked" | "none";

export async function getFriends(): Promise<PersonRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_friends");
  if (error) throw new Error(`my_friends failed: ${error.code}`);
  return (data ?? []).map((r) => ({
    username: r.username,
    fullName: r.full_name,
    department: r.department,
    graduationYear: r.graduation_year,
    avatarUrl: publicImageUrl("avatars", r.avatar_path),
  }));
}

export async function getFriendRequests(): Promise<FriendRequestRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_friend_requests");
  if (error) throw new Error(`my_friend_requests failed: ${error.code}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    direction: r.direction === "received" ? "received" : "sent",
    username: r.username,
    fullName: r.full_name,
    department: r.department,
    graduationYear: r.graduation_year,
    avatarUrl: publicImageUrl("avatars", r.avatar_path),
    createdAt: r.created_at,
  }));
}

export async function getBlocks(): Promise<BlockRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_blocks");
  if (error) throw new Error(`my_blocks failed: ${error.code}`);
  return (data ?? []).map((r) => ({ username: r.username, fullName: r.full_name, createdAt: r.created_at }));
}

/** The caller's relationship with one person, or null when that person can't be found. */
export const getFriendshipState = cache(
  async (username: string): Promise<{ state: FriendshipState; requestId: string | null } | null> => {
    const supabase = await createClient();
    const { data } = await supabase.rpc("friendship_state", { p_username: username });
    const row = data?.[0];
    if (!row) return null;
    return { state: row.state as FriendshipState, requestId: row.request_id };
  },
);

export async function getPendingFriendRequestCount(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("pending_friend_request_count");
  return data ?? 0;
}
