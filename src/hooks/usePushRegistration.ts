/**
 * usePushRegistration - browser Web Push permission + subscription handling.
 *
 * Registers the dedicated push worker (`/push-sw.js`) only when the user
 * explicitly enables notifications, then stores the subscription server-side
 * through the `push-subscribe` edge function.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SW_URL = "/push-sw.js";

export type PushStatus = "unsupported" | "default" | "granted" | "denied";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function keyToB64(sub: PushSubscription, name: "p256dh" | "auth"): string {
  const buf = sub.getKey(name);
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function usePushRegistration() {
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const [status, setStatus] = useState<PushStatus>(supported ? "default" : "unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    setStatus(Notification.permission as PushStatus);
    void navigator.serviceWorker
      .getRegistration(SW_URL)
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSubscribed(false));
  }, [supported]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setStatus(permission as PushStatus);
      if (permission !== "granted") return false;

      const { data: keyData } = await supabase.functions.invoke("push-subscribe", {
        method: "GET",
      });
      const publicKey: string = keyData?.publicKey ?? "";
      if (!publicKey) return false;

      const reg = await navigator.serviceWorker.register(SW_URL);
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const { error } = await supabase.functions.invoke("push-subscribe", {
        body: {
          action: "subscribe",
          endpoint: sub.endpoint,
          p256dh: keyToB64(sub, "p256dh"),
          auth: keyToB64(sub, "auth"),
        },
      });
      if (error) return false;
      setSubscribed(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported]);

  const disable = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.functions.invoke("push-subscribe", {
          body: { action: "unsubscribe", endpoint: sub.endpoint },
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [supported]);

  return { supported, status, subscribed, busy, enable, disable };
}
