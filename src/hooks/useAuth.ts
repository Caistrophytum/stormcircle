import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id: string;
  username: string;
  email: string;
  badge: string;
  meteorologist_applied: boolean;
  created_at: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        // Defer Supabase calls to avoid deadlocks inside the callback
        setTimeout(() => {
          if (!mounted) return;
          fetchProfile(nextUser.id);
        }, 0);
      } else {
        setProfile(null);
      }
    });

    // THEN check existing session
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

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  return { user, profile, loading, signOut };
}
