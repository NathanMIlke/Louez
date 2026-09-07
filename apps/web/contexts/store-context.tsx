'use client'

import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { setStorefrontSlug } from '@/lib/orpc/client'
import { isDiscountDisplayable } from '@/lib/utils/util.discount-visibility'

interface StoreContextValue {
  storeId: string
  currency: string
  storeSlug: string
  storeName: string
  timezone?: string
  maxDiscountPercent?: number | null
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined)

interface StoreProviderProps {
  children: ReactNode
  storeId: string
  currency: string
  storeSlug: string
  storeName: string
  timezone?: string
  maxDiscountPercent?: number | null
}

export function StoreProvider({
  children,
  storeId,
  currency,
  storeSlug,
  storeName,
  timezone,
  maxDiscountPercent,
}: StoreProviderProps) {
  // Set the store slug for the ORPC client synchronously during render,
  // so it's available before any child component makes API calls.
  setStorefrontSlug(storeSlug)

  return (
    <StoreContext.Provider
      value={{ storeId, currency, storeSlug, storeName, timezone, maxDiscountPercent }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const context = useContext(StoreContext)
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider')
  }
  return context
}

// Hook pour obtenir la devise avec fallback
export function useStoreCurrency(): string {
  const context = useContext(StoreContext)
  return context?.currency || 'EUR'
}

export function useStoreTimezone(): string | undefined {
  const context = useContext(StoreContext)
  return context?.timezone
}

export function useStoreMaxDiscountPercent(): number | null | undefined {
  const context = useContext(StoreContext)
  return context?.maxDiscountPercent
}

/**
 * Predicate for every storefront surface that advertises a markdown: badge,
 * strikethrough, discount row, "you save" line. Bound to the store's cap so
 * callers only pass the percentage they are about to show.
 */
export function useDiscountVisibility(): (reductionPercent: number | null | undefined) => boolean {
  const maxDiscountPercent = useStoreMaxDiscountPercent()
  return useCallback(
    (reductionPercent: number | null | undefined) =>
      isDiscountDisplayable(reductionPercent, maxDiscountPercent),
    [maxDiscountPercent],
  )
}
