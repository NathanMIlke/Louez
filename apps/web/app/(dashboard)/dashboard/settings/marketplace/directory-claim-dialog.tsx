"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { useFormatter, useTranslations } from "next-intl";

import {
  Button,
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  toastManager,
} from "@louez/ui";
import { LinkIcon, MapPinIcon } from "@louez/ui/icons";

import type { MarketplaceMatchCandidate } from "@/lib/marketplace-match";

import { confirmDirectoryClaim, dismissDirectoryClaim } from "./actions";
import { useServiceErrorToast } from "./use-service-error-toast";

interface DirectoryClaimDialogProps {
  candidates: MarketplaceMatchCandidate[];
  /** Directory listing the owner already confirmed as theirs, if any. */
  claimedBusinessId: string | null;
}

/**
 * Page-header trigger for the directory claim: a quiet button while the
 * owner has not looked at the candidates, a "linked" one once they have. The
 * candidates and the linked listing live in the dialog so the channel list
 * below stays about channels.
 */
export const DirectoryClaimDialog = ({
  candidates,
  claimedBusinessId,
}: DirectoryClaimDialogProps) => {
  const t = useTranslations("dashboard.settings.salesChannels.claim");
  const format = useFormatter();
  const router = useRouter();
  const notifyError = useServiceErrorToast();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const linkedCandidate =
    candidates.find((candidate) => candidate.businessId === claimedBusinessId) ?? null;
  const isLinked = claimedBusinessId !== null;

  if (!isLinked && (dismissed || candidates.length === 0)) {
    return null;
  }

  const handleConfirm = (candidate: MarketplaceMatchCandidate) => {
    startTransition(async () => {
      const result = await confirmDirectoryClaim({ businessId: candidate.businessId });
      if ("error" in result) {
        notifyError(result.error);
        return;
      }

      toastManager.add({ title: t("confirmedToast"), type: "success" });
      setOpen(false);
      router.refresh();
    });
  };

  const handleDismiss = (unlink: boolean) => {
    startTransition(async () => {
      const result = await dismissDirectoryClaim({});
      if ("error" in result) {
        notifyError(result.error);
        return;
      }

      toastManager.add({ title: t(unlink ? "unlinkedToast" : "dismissedToast"), type: "success" });
      setOpen(false);
      if (unlink) {
        router.refresh();
        return;
      }
      setDismissed(true);
    });
  };

  const formatDistance = (distanceM: number | null) => {
    if (distanceM === null) return null;
    return distanceM < 1000
      ? t("distanceMeters", { distance: format.number(Math.round(distanceM)) })
      : t("distanceKilometers", {
          distance: format.number(distanceM / 1000, { maximumFractionDigits: 1 }),
        });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {isLinked ? <LinkIcon className="size-4" /> : <MapPinIcon className="size-4" />}
        {t(isLinked ? "linkedAction" : "openAction")}
      </Button>

      <DialogPopup className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isLinked ? (
              <LinkIcon className="size-5 shrink-0" />
            ) : (
              <MapPinIcon className="size-5 shrink-0" />
            )}
            {t(isLinked ? "linkedTitle" : "title")}
          </DialogTitle>
          <DialogDescription>{t(isLinked ? "linkedDescription" : "description")}</DialogDescription>
        </DialogHeader>

        <DialogPanel>
          {isLinked ? (
            <div className="rounded-lg border p-3">
              <p className="truncate text-sm font-medium">
                {linkedCandidate?.name ?? t("linkedFallback")}
              </p>
              <code className="text-muted-foreground block truncate text-xs">
                {linkedCandidate?.slug ?? claimedBusinessId}
              </code>
              <p className="text-muted-foreground mt-1 text-xs">{t("mergeHint")}</p>
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {candidates.map((candidate) => {
                const distanceLabel = formatDistance(candidate.distanceM);

                return (
                  <li
                    key={candidate.businessId}
                    className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium">{candidate.name}</p>
                      {candidate.address !== "" && (
                        <p className="text-muted-foreground text-sm">{candidate.address}</p>
                      )}
                      {distanceLabel !== null && (
                        <p className="text-muted-foreground text-xs">{distanceLabel}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 self-start sm:self-auto"
                      disabled={isPending}
                      onClick={() => handleConfirm(candidate)}
                    >
                      {t("confirmAction")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogPanel>

        <DialogFooter>
          <Button variant="ghost" disabled={isPending} onClick={() => handleDismiss(isLinked)}>
            {t(isLinked ? "unlinkAction" : "noneAction")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
};
