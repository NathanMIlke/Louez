import { redirect } from "next/navigation";

import { getTranslations } from "next-intl/server";

import { getMarketplaceChannelState, getMarketplaceCohortStatus } from "@louez/api/services";

import { env } from "@/env";
import { SettingsPageShell } from "@/components/dashboard/settings-page-shell";
import { fetchMarketplaceMatches, inferMarketplaceMatchCity } from "@/lib/marketplace-match";
import { getCurrentStore } from "@/lib/store-context";
import { getStorefrontUrl } from "@/lib/storefront-url";

import { DirectoryClaimDialog } from "./directory-claim-dialog";
import { MarketplaceChannelForm } from "./marketplace-channel-form";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function MarketplaceChannelSettingsPage() {
  const store = await getCurrentStore();

  if (!store) {
    redirect("/onboarding");
  }

  const t = await getTranslations("dashboard.settings.salesChannels");

  const channelState = await getMarketplaceChannelState({ storeId: store.id });
  const isEnabled = channelState.channel?.enabledByOwner === true;
  const [matchCandidates, cohort] = await Promise.all([
    isEnabled
      ? fetchMarketplaceMatches({
          name: store.name,
          latitude: store.latitude,
          longitude: store.longitude,
          city: inferMarketplaceMatchCity(store.address),
        })
      : Promise.resolve(null),
    getMarketplaceCohortStatus(env.REEENT_LAUNCH_COHORT_SIZE),
  ]);

  const claimedBusinessId = isEnabled ? (channelState.channel?.claimedBusinessId ?? null) : null;
  const candidates = matchCandidates?.slice(0, 3) ?? [];

  return (
    <SettingsPageShell
      title={t("title")}
      description={t("description")}
      width="wide"
      actions={
        isEnabled && (claimedBusinessId !== null || candidates.length > 0) ? (
          <DirectoryClaimDialog candidates={candidates} claimedBusinessId={claimedBusinessId} />
        ) : undefined
      }
    >
      <MarketplaceChannelForm
        channelState={channelState}
        cohortRemaining={cohort.remaining}
        storefrontUrl={getStorefrontUrl(store.slug, "/")}
      />
    </SettingsPageShell>
  );
}
