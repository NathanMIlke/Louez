'use server'

import { db } from '@louez/db'
import { getCurrentStore } from '@/lib/store-context'
import { customers, locacameraCustomerProfiles, reservations } from '@louez/db'
import { eq, and, count } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import {
  customerSchema,
  digitsOnly,
  isValidCompanyNumber,
  resolveCompanyNumberScheme,
  type CustomerInput,
} from '@louez/validations'
import { notifyCustomerCreated } from '@/lib/discord/platform-notifications'

type LocaCameraCustomerInput = CustomerInput & {
  cpfCnpj?: string | null
  birthday?: string | Date | null
  gender?: string | null
  instagram?: string | null
  acquisitionSource?: string | null
  registeredAt?: string | Date | null
  backupContact?: string | null
  pinnedFiles?: string | null
}

async function getStoreId() {
  const store = await getCurrentStore()

  if (!store) {
    throw new Error('errors.storeNotFound')
  }

  return store.id
}

function resolveCustomerCompanyFields(validated: CustomerInput) {
  if (validated.customerType !== 'business') {
    return { companyNumber: null, companyNumberScheme: null, vatNumber: null }
  }

  const country = validated.country ?? ''
  const raw = validated.companyNumber?.trim() ?? ''
  const isUsable = raw.length > 0 && isValidCompanyNumber(country, raw)
  const scheme = isUsable ? resolveCompanyNumberScheme(country) : null
  const companyNumber = scheme ? digitsOnly(raw) : raw
  const vatNumber = validated.vatNumber?.replace(/\s/g, '').toUpperCase() ?? ''

  return {
    companyNumber: companyNumber.length > 0 ? companyNumber : null,
    companyNumberScheme: scheme,
    vatNumber: vatNumber.length > 0 ? vatNumber : null,
  }
}

function nullableText(value: unknown, maxLength = 255) {
  const normalized = String(value ?? '').trim().slice(0, maxLength)
  return normalized || null
}

function normalizedDocument(value: unknown) {
  const normalized = String(value ?? '').replace(/\D/g, '').slice(0, 14)
  return normalized || null
}

function normalizedInstagram(value: unknown) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\?.*$/, '')
    .replace(/\/+$/, '')
    .slice(0, 255)

  return normalized || null
}

function normalizedPinnedFiles(value: unknown) {
  const unique = Array.from(
    new Set(
      String(value ?? '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  )

  return unique.length > 0 ? unique.join('\n') : null
}

function normalizedDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const raw = String(value ?? '').trim()
  if (!raw) return null

  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`)
    : new Date(raw)

  return Number.isNaN(date.getTime()) ? null : date
}

async function saveLocaCameraCustomerProfile(
  customerId: string,
  storeId: string,
  data: LocaCameraCustomerInput,
) {
  const cpfCnpj = normalizedDocument(data.cpfCnpj)
  const birthday = normalizedDate(data.birthday)
  const gender = nullableText(data.gender, 32)
  const instagram = normalizedInstagram(data.instagram)
  const acquisitionSource = nullableText(data.acquisitionSource)
  const registeredAt = normalizedDate(data.registeredAt)
  const backupContact = nullableText(data.backupContact)
  const pinnedFiles = normalizedPinnedFiles(data.pinnedFiles)

  const [existing] = await db
    .select({ customerId: locacameraCustomerProfiles.customerId })
    .from(locacameraCustomerProfiles)
    .where(
      and(
        eq(locacameraCustomerProfiles.customerId, customerId),
        eq(locacameraCustomerProfiles.storeId, storeId),
      ),
    )
    .limit(1)

  if (existing) {
    await db
      .update(locacameraCustomerProfiles)
      .set({
        cpfCnpj,
        birthday,
        gender,
        genderName: gender,
        instagram,
        acquisitionSource,
        registeredAt,
        backupContact,
        pinnedFiles,
        updatedAt: new Date(),
      })
      .where(eq(locacameraCustomerProfiles.customerId, customerId))
    return
  }

  await db.insert(locacameraCustomerProfiles).values({
    customerId,
    storeId,
    cpfCnpj,
    birthday,
    gender,
    genderName: gender,
    instagram,
    acquisitionSource,
    registeredAt,
    backupContact,
    pinnedFiles,
  })
}

export async function createCustomer(data: LocaCameraCustomerInput) {
  try {
    const store = await getCurrentStore()
    if (!store) return { error: 'errors.storeNotFound' }

    const validated = customerSchema.parse(data)

    const existingCustomer = await db.query.customers.findFirst({
      where: and(
        eq(customers.storeId, store.id),
        eq(customers.email, validated.email)
      ),
    })

    if (existingCustomer) {
      return { error: 'errors.emailAlreadyExists' }
    }

    const [customer] = await db
      .insert(customers)
      .values({
        storeId: store.id,
        ...validated,
        ...resolveCustomerCompanyFields(validated),
      })
      .$returningId()

    await saveLocaCameraCustomerProfile(customer.id, store.id, data)

    notifyCustomerCreated(
      { id: store.id, name: store.name, slug: store.slug },
      { firstName: validated.firstName, lastName: validated.lastName, email: validated.email }
    ).catch(() => {})

    revalidatePath('/dashboard/customers')
    return { success: true, customerId: customer.id }
  } catch (error) {
    console.error('Error creating customer:', error)
    return { error: 'errors.createCustomerError' }
  }
}

export async function updateCustomer(customerId: string, data: LocaCameraCustomerInput) {
  try {
    const storeId = await getStoreId()
    const validated = customerSchema.parse(data)

    const existingCustomer = await db.query.customers.findFirst({
      where: and(
        eq(customers.id, customerId),
        eq(customers.storeId, storeId)
      ),
    })

    if (!existingCustomer) {
      return { error: 'errors.customerNotFound' }
    }

    if (validated.email !== existingCustomer.email) {
      const emailExists = await db.query.customers.findFirst({
        where: and(
          eq(customers.storeId, storeId),
          eq(customers.email, validated.email)
        ),
      })

      if (emailExists) {
        return { error: 'errors.emailAlreadyExists' }
      }
    }

    await db
      .update(customers)
      .set({
        ...validated,
        ...resolveCustomerCompanyFields(validated),
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId))

    await saveLocaCameraCustomerProfile(customerId, storeId, data)

    revalidatePath('/dashboard/customers')
    revalidatePath(`/dashboard/customers/${customerId}`)
    return { success: true }
  } catch (error) {
    console.error('Error updating customer:', error)
    return { error: 'errors.updateCustomerError' }
  }
}

export async function deleteCustomer(customerId: string) {
  try {
    const storeId = await getStoreId()

    const existingCustomer = await db.query.customers.findFirst({
      where: and(
        eq(customers.id, customerId),
        eq(customers.storeId, storeId)
      ),
    })

    if (!existingCustomer) {
      return { error: 'errors.customerNotFound' }
    }

    const reservationCount = await db
      .select({ count: count() })
      .from(reservations)
      .where(eq(reservations.customerId, customerId))

    if (reservationCount[0]?.count > 0) {
      return { error: 'errors.customerHasReservations' }
    }

    await db
      .delete(locacameraCustomerProfiles)
      .where(eq(locacameraCustomerProfiles.customerId, customerId))
    await db.delete(customers).where(eq(customers.id, customerId))

    revalidatePath('/dashboard/customers')
    return { success: true }
  } catch (error) {
    console.error('Error deleting customer:', error)
    return { error: 'errors.deleteCustomerError' }
  }
}

export async function updateCustomerNotes(customerId: string, notes: string) {
  try {
    const storeId = await getStoreId()

    const existingCustomer = await db.query.customers.findFirst({
      where: and(
        eq(customers.id, customerId),
        eq(customers.storeId, storeId)
      ),
    })

    if (!existingCustomer) {
      return { error: 'errors.customerNotFound' }
    }

    await db
      .update(customers)
      .set({
        notes,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId))

    revalidatePath(`/dashboard/customers/${customerId}`)
    return { success: true }
  } catch (error) {
    console.error('Error updating customer notes:', error)
    return { error: 'errors.updateNotesError' }
  }
}
