"use client";

import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { PLAN_FEATURES, type FeatureKey } from "@/lib/features";
export { PLAN_FEATURES, type FeatureKey, type Plan } from "@/lib/features";

/**
 * Hook to check if a feature is enabled for the current account.
 * Returns false while profile is loading.
 *
 * Fetches features from the backend on mount and caches them.
 */
export function useEnabledFeatures() {
  const { profileLoading, accountId, isMasterAdmin } = useAuth();
  const [enabledFeatures, setEnabledFeatures] = useState<FeatureKey[]>(
    PLAN_FEATURES["pro"] // Default to pro plan while loading
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profileLoading || !accountId) return;

    const fetchFeatures = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/account/features");
        if (!res.ok) throw new Error("Failed to fetch features");

        const data = await res.json();
        setEnabledFeatures(data.enabledFeatures ?? PLAN_FEATURES["pro"]);
      } catch (err) {
        console.error("[useEnabledFeatures] fetch error:", err);
        // Fall back to pro plan on error
        setEnabledFeatures(PLAN_FEATURES["pro"]);
      } finally {
        setLoading(false);
      }
    };

    fetchFeatures();
  }, [profileLoading, accountId]);

  const hasFeature = (feature: FeatureKey): boolean => {
    if (profileLoading || loading) return false;
    // The master administrator manages every customer account and must
    // always be able to inspect/configure the complete product, regardless
    // of the plan assigned to the account currently being viewed.
    if (isMasterAdmin) return true;
    return enabledFeatures.includes(feature);
  };

  return { hasFeature, enabledFeatures, profileLoading: profileLoading || loading };
}
