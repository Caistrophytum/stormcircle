/**
 * useOnlineCount — thin selector over the shared DataProvider. The presence
 * channel is opened ONCE for the whole page instead of once per consumer.
 */
import { useDataContext } from "@/providers/DataProvider";

export function useOnlineCount() {
  return useDataContext().onlineCount;
}
