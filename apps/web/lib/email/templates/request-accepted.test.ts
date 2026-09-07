import assert from 'node:assert/strict'
import { test } from 'node:test'
import { render } from '@react-email/render'

import { resolveReservationEmailLocale } from '../i18n'
import { RequestAcceptedEmail } from './request-accepted'

test('keeps Dutch for a Belgian reservation acceptance email', async () => {
  const locale = resolveReservationEmailLocale('nl', 'BE')
  assert.equal(locale, 'nl')
  const html = await render(RequestAcceptedEmail({
    storeName: 'Test Organisation',
    storeCountry: 'BE',
    storeTimezone: 'Europe/Brussels',
    customerFirstName: 'Test',
    reservationNumber: 'TEST-001',
    startDate: new Date('2026-09-08T12:00:00Z'),
    endDate: new Date('2026-09-09T18:30:00Z'),
    items: [{ name: 'Test product', quantity: 1, totalPrice: 41.77 }],
    total: 41.77,
    deposit: 300,
    reservationUrl: 'https://example.com/reservation',
    contractUrl: 'https://example.com/contract',
    locale,
  }))
  assert.match(html, /Aanvraag geaccepteerd!/)
  assert.match(html, /dinsdag 8 september 2026 om 14:00/)
  assert.match(html, /Mijn reservering bekijken/)
  assert.match(html, /Huurovereenkomst bekijken/)
  assert.doesNotMatch(html, /Demande acceptée|Bonjour|Votre réservation/)
})

test('preserves the country fallback for older reservations without a valid language', () => {
  assert.equal(resolveReservationEmailLocale(null, 'BE'), 'fr')
  assert.equal(resolveReservationEmailLocale('invalid', 'NL'), 'nl')
  assert.equal(resolveReservationEmailLocale('en', 'BE'), 'en')
  assert.equal(resolveReservationEmailLocale(undefined, undefined), 'en')
})
