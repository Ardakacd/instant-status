export enum StatusState {
  AVAILABLE = "AVAILABLE",
  BUSY = "BUSY",
  DND = "DND",
  FOCUS = "FOCUS",
  SOCIAL = "SOCIAL",
  COMMUTE = "COMMUTE",
}

export interface User {
  id: string;
  firebase_uid: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  is_premium: boolean;
  premium_until: string | null;
  is_in_grace_period: boolean;
  should_reset_custom_status: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StatusOption {
  id: string;
  user_id: string | null;
  label: string;
  emoji: string;
  color: string;
  sort_order: number;
}

export interface Status {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  option: StatusOption | null;
  note: string | null;
  expires_at: string | null;
  updated_at: string;
}

export interface Connection {
  id: string;
  friend_id: string;
  friend_first_name: string | null;
  friend_last_name: string | null;
  friend_avatar_url: string | null;
  visibility: boolean; // Combined visibility (both must be true)
  user_shows_status: boolean; // This user's visibility setting
  created_at: string;
}
