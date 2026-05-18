/**
 * useAuth — thin selector over the shared DataProvider.
 *
 * One auth subscription per page (in DataProvider) instead of one per
 * consuming component. The provider also catches "refresh_token_not_found"
 * and network errors during getSession() so `loading` resolves immediately
 * instead of leaving the UI in a half-rendered state.
 */
import { useDataContext } from "@/providers/DataProvider";

export interface Profile {
  id: string;
  username: string;
  email: string;
  badge: string;
  meteorologist_applied: boolean;
  location: string | null;
  created_at: string | null;
}

export function useAuth() {
  return useDataContext().auth;
}
