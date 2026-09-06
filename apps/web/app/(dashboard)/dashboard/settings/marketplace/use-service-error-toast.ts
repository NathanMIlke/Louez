"use client";

import { useTranslations } from "next-intl";

import { toastManager } from "@louez/ui";

/**
 * Server actions surface `ApiServiceError` keys verbatim ("errors.<name>").
 * Returns a notifier that maps such a key to its translated toast, falling
 * back to the generic error when the key is unknown.
 */
export const useServiceErrorToast = () => {
  const tErrors = useTranslations("errors");

  return (key: string | undefined) => {
    const errorKey = key?.startsWith("errors.") === true ? key.slice("errors.".length) : null;
    const message =
      errorKey !== null && tErrors.has(errorKey) ? tErrors(errorKey) : tErrors("generic");
    toastManager.add({ title: message, type: "error" });
  };
};
