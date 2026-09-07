import { isLocale } from '@/lib/i18n/format-locale'
import { NextResponse } from 'next/server'
import { db } from '@louez/db'
import { getCurrentStore } from '@/lib/store-context'
import { reservations } from '@louez/db'
import { eq, and } from 'drizzle-orm'
import { generateContract, getContractPdfBuffer } from '@/lib/pdf/generate'
import type { SupportedLocale } from '@/lib/pdf/contract'
import {
  captureProductServerEvent,
  captureReservationActionSucceeded,
} from '@/lib/product-analytics/analytics'
import {
  productAnalyticsEvents,
  reservationAnalyticsActions,
} from '@/lib/product-analytics/analytics-events'

// Parse Accept-Language header to determine preferred locale
function getPreferredLocale(acceptLanguage: string | null): SupportedLocale {
  if (!acceptLanguage) {
    return 'fr' // Default to French
  }

  // Parse Accept-Language header (e.g., "en-US,en;q=0.9,fr;q=0.8")
  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const [code, quality = 'q=1'] = lang.trim().split(';')
      const q = parseFloat(quality.replace('q=', '')) || 1
      return { code: code.toLowerCase().split('-')[0], q }
    })
    .sort((a, b) => b.q - a.q)

  // Find first supported language
  for (const { code } of languages) {
    if (code && isLocale(code)) return code
  }

  return 'fr' // Default to French if no supported language found
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reservationId } = await params

  // Get store for user
  const store = await getCurrentStore()

  if (!store) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Get reservation and verify it belongs to the user's store
  const reservation = await db.query.reservations.findFirst({
    where: and(
      eq(reservations.id, reservationId),
      eq(reservations.storeId, store.id)
    ),
    with: {
      documents: true,
    },
  })

  if (!reservation) {
    return new NextResponse('Reservation not found', { status: 404 })
  }

  // Detect language from Accept-Language header or query parameter
  const url = new URL(request.url)
  const langParam = url.searchParams.get('lang')

  let locale: SupportedLocale
  if (langParam && isLocale(langParam)) {
    locale = langParam
  } else if (reservation.locale && isLocale(reservation.locale)) {
    locale = reservation.locale
  } else {
    const acceptLanguage = request.headers.get('Accept-Language')
    locale = getPreferredLocale(acceptLanguage)
  }

  // Always regenerate contract to ensure latest data with correct locale
  const contract = await generateContract({ reservationId, regenerate: true, locale })
  if (!contract) {
    await captureProductServerEvent({
      distinctId: store.userId,
      event: productAnalyticsEvents.reservationActionFailed,
      properties: {
        feature: 'reservation_management',
        surface: 'dashboard',
        store_id: store.id,
        reservation_id: reservationId,
        action: reservationAnalyticsActions.downloadContract,
        error_code: 'contract_generation_failed',
      },
    })
    return new NextResponse('Failed to generate contract', { status: 500 })
  }

  // Get PDF buffer
  const pdfBuffer = await getContractPdfBuffer(reservationId)

  if (!pdfBuffer) {
    await captureProductServerEvent({
      distinctId: store.userId,
      event: productAnalyticsEvents.reservationActionFailed,
      properties: {
        feature: 'reservation_management',
        surface: 'dashboard',
        store_id: store.id,
        reservation_id: reservationId,
        action: reservationAnalyticsActions.downloadContract,
        error_code: 'contract_file_missing',
      },
    })
    return new NextResponse('Contract file not found', { status: 404 })
  }

  await captureReservationActionSucceeded({
    distinctId: store.userId,
    storeId: store.id,
    reservationId,
    action: reservationAnalyticsActions.downloadContract,
    properties: { locale },
  })

  // Return PDF - convert Buffer to Uint8Array for Response compatibility
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${contract.fileName}"`,
      'Content-Language': locale,
    },
  })
}
