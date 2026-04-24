/**
 * useAuth — single source of truth for "who is the current user".
 *
 * Returns:
 *   user     — Supabase auth user (id, email, etc.) or null when signed out
 *   profile  — our public.profiles row (username, badge, applied flag…)
 *   loading  — true on the very first render while we restore the session
 *   signOut  — convenience wrapper that signs out AND clears local state
 *
 * The order of operations inside useEffect matters:
 *   1. Subscribe to onAuthStateChange FIRST. If we did getSession() first,
 *      a sign-in/out happening between the two calls could be missed.
 *   2. Then call getSession() to hydrate the existing session on page load.
 *
 * Profile fetches are deferred via setTimeout(0) inside the auth callback
 * because making Supabase calls synchronously inside the callback can
 * deadlock the auth client (documented Supabase gotcha).
 */
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id: string;
  username: string;
  email: string;
  badge: string;                  // "Citizen" | "Meteorologist"
  meteorologist_applied: boolean; // true once user has submitted application
  created_at: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // `mounted` guards against state updates after the component unmounts
    // (e.g. quick navigation away while a fetch is still in flight).
    let mounted = true;

    // Step 1 — set up the listener BEFORE checking the existing session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        // Defer the profile fetch off the auth callback's microtask to
        // avoid the "supabase deadlock when calling supabase from inside
        // an auth event" issue.
        setTimeout(() => {
          if (!mounted) return;
          fetchProfile(nextUser.id);
        }, 0);
      } else {
        setProfile(null);
      }
    });

    // Step 2 — pick up an already-signed-in user from localStorage.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      const existingUser = session?.user ?? null;
      setUser(existingUser);
      if (existingUser) {
        fetchProfile(existingUser.id).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Pulls the matching row from public.profiles (RLS limits this to the
    // currently signed-in user's own row).
    async function fetchProfile(userId: string) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (!mounted) return;
      if (error) {
        console.error("Failed to load profile:", error);
        setProfile(null);
      } else {
        setProfile(data as Profile | null);
      }
    }

    // Cleanup: stop listening when the component unmounts.
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Wrapper so callers don't have to remember to also clear local state.
  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return { user, profile, loading, signOut };
}
