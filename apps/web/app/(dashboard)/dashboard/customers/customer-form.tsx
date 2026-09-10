'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useTransition, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useStore } from '@tanstack/react-form'

import { Button, Label } from '@louez/ui'
import { Input } from '@louez/ui'
import { PhoneInput } from '@/components/ui/phone-input'
import { Switch } from '@louez/ui'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@louez/ui'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@louez/ui'
import { customerSchema } from '@louez/validations'
import { createCustomer, updateCustomer } from './actions'
import { useAppForm } from '@/hooks/form/form'
import { getFieldError } from '@/hooks/form/form-context'
import { RootError } from '@/components/form/root-error'
import { trackOpenReplayEvent } from '@/lib/openreplay/client'
import {
  openReplayEvents,
  type DashboardCreationSource,
} from '@/lib/openreplay/events'

interface Customer {
  id: string
  customerType: 'individual' | 'business'
  email: string
  firstName: string
  lastName: string
  companyName: string | null
  companyNumber: string | null
  vatNumber: string | null
  phone: string | null
  address: string | null
  city: string | null
  postalCode: string | null
  country: string | null
  notes: string | null
  cpfCnpj?: string | null
  birthday?: Date | string | null
  gender?: string | null
  instagram?: string | null
  acquisitionSource?: string | null
  registeredAt?: Date | string | null
  backupContact?: string | null
  pinnedFiles?: string | null
}

interface CustomerFormProps {
  customer?: Customer
  openReplaySource?: DashboardCreationSource
}

const COUNTRY_CODES = ['BR', 'FR', 'BE', 'CH', 'LU', 'MC', 'CA'] as const
const GENDER_OPTIONS = ['Masculino', 'Feminino', 'Outro', 'Prefere não informar'] as const

function dateInputValue(value: Date | string | null | undefined) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function documentInputValue(value: string | null | undefined) {
  return value?.replace(/\D/g, '').slice(0, 14) ?? ''
}

export function CustomerForm({
  customer,
  openReplaySource = 'direct',
}: CustomerFormProps) {
  const router = useRouter()
  const t = useTranslations('dashboard.customers.form')
  const tCountries = useTranslations('dashboard.customers.countries')
  const tCommon = useTranslations('common')
  const [isPending, startTransition] = useTransition()
  const isEditing = !!customer
  const [rootError, setRootError] = useState<string | null>(null)

  useEffect(() => {
    if (isEditing) return

    trackOpenReplayEvent(openReplayEvents.dashboardCustomerCreationStarted, {
      journey: 'customer_creation',
      step: 'started',
      source: openReplaySource,
    })
  }, [isEditing, openReplaySource])

  const form = useAppForm({
    defaultValues: {
      customerType: customer?.customerType || ('individual' as const),
      email: customer?.email || '',
      firstName: customer?.firstName || '',
      lastName: customer?.lastName || '',
      companyName: customer?.companyName || undefined,
      companyNumber: customer?.companyNumber || undefined,
      vatNumber: customer?.vatNumber || undefined,
      phone: customer?.phone || undefined,
      address: customer?.address || undefined,
      city: customer?.city || undefined,
      postalCode: customer?.postalCode || undefined,
      country: customer?.country || 'BR',
      notes: customer?.notes || undefined,
      cpfCnpj: documentInputValue(customer?.cpfCnpj) || undefined,
      birthday: dateInputValue(customer?.birthday) || undefined,
      gender: customer?.gender || undefined,
      instagram: customer?.instagram || undefined,
      acquisitionSource: customer?.acquisitionSource || undefined,
      registeredAt: dateInputValue(customer?.registeredAt) || undefined,
      backupContact: customer?.backupContact || undefined,
      pinnedFiles: customer?.pinnedFiles || undefined,
    },
    onSubmit: async ({ value }) => {
      setRootError(null)

      const validation = customerSchema.safeParse(value)
      if (!validation.success) {
        const firstError = validation.error.issues[0]
        if (firstError) setRootError(firstError.message)
        return
      }

      const payload = {
        ...validation.data,
        cpfCnpj: value.cpfCnpj || undefined,
        birthday: value.birthday || undefined,
        gender: value.gender || undefined,
        instagram: value.instagram || undefined,
        acquisitionSource: value.acquisitionSource || undefined,
        registeredAt: value.registeredAt || undefined,
        backupContact: value.backupContact || undefined,
        pinnedFiles: value.pinnedFiles || undefined,
      }

      startTransition(async () => {
        const result = isEditing
          ? await updateCustomer(customer.id, payload)
          : await createCustomer(payload)

        if (result.error) {
          setRootError(result.error)
          return
        }

        if (!isEditing) {
          trackOpenReplayEvent(
            openReplayEvents.dashboardCustomerCreationCompleted,
            {
              journey: 'customer_creation',
              step: 'completed',
              source: openReplaySource,
            },
          )
        }

        if (isEditing) router.push(`/dashboard/customers/${customer.id}`)
        else router.push('/dashboard/customers')
      })
    },
  })

  const customerType = useStore(form.store, (s) => s.values.customerType)
  const country = useStore(form.store, (s) => s.values.country)

  const companyNumberLabel =
    country === 'FR'
      ? t('companyNumberSiren')
      : country === 'BE'
        ? t('companyNumberBce')
        : t('companyNumber')

  const countryLabel = (code: (typeof COUNTRY_CODES)[number] | string) =>
    code === 'BR' ? 'Brasil' : tCountries(code)

  return (
    <form.AppForm>
      <form.Form className="space-y-6">
        <RootError error={rootError} />

        <Card>
          <CardHeader>
            <CardTitle>{t('personalInfo')}</CardTitle>
            <CardDescription>{t('personalInfoDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form.Field name="customerType">
              {(field) => (
                <div className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label className="text-base">{t('businessCustomer')}</Label>
                    <p className="text-sm text-muted-foreground">{t('businessCustomerDescription')}</p>
                  </div>
                  <Switch
                    checked={field.state.value === 'business'}
                    onCheckedChange={(checked) => {
                      field.handleChange(checked ? 'business' : 'individual')
                      if (!checked) {
                        form.setFieldValue('companyName', undefined)
                        form.setFieldValue('companyNumber', undefined)
                        form.setFieldValue('vatNumber', undefined)
                      }
                    }}
                  />
                </div>
              )}
            </form.Field>

            {customerType === 'business' && (
              <form.Field name="companyName">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>{t('companyName')} *</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value || ''}
                      onChange={(e) => field.handleChange(e.target.value || undefined)}
                      onBlur={field.handleBlur}
                      placeholder={t('companyNamePlaceholder')}
                    />
                    {field.state.meta.errors.length > 0 && (
                      <p className="text-sm font-medium text-destructive">{getFieldError(field.state.meta.errors[0])}</p>
                    )}
                  </div>
                )}
              </form.Field>
            )}

            {customerType === 'business' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <form.Field name="companyNumber">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor={field.name}>{companyNumberLabel}</Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        inputMode="numeric"
                        autoComplete="off"
                        value={field.state.value || ''}
                        onChange={(e) => field.handleChange(e.target.value || undefined)}
                        onBlur={field.handleBlur}
                        placeholder={t('companyNumberPlaceholder')}
                      />
                      <p className="text-sm text-muted-foreground">{t('companyNumberHelp')}</p>
                      {field.state.meta.errors.length > 0 && (
                        <p className="text-sm font-medium text-destructive">{getFieldError(field.state.meta.errors[0])}</p>
                      )}
                    </div>
                  )}
                </form.Field>

                <form.Field name="vatNumber">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor={field.name}>{t('vatNumber')}</Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        autoComplete="off"
                        value={field.state.value || ''}
                        onChange={(e) => field.handleChange(e.target.value || undefined)}
                        onBlur={field.handleBlur}
                        placeholder={t('vatNumberPlaceholder')}
                      />
                    </div>
                  )}
                </form.Field>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <form.AppField name="firstName">
                {(field) => <field.Input label={t('firstName')} placeholder={t('firstNamePlaceholder')} />}
              </form.AppField>
              <form.AppField name="lastName">
                {(field) => <field.Input label={t('lastName')} placeholder={t('lastNamePlaceholder')} />}
              </form.AppField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <form.AppField name="email">
                {(field) => <field.Input label={t('email')} type="email" placeholder={t('emailPlaceholder')} />}
              </form.AppField>

              <form.Field name="phone">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>{t('phone')}</Label>
                    <PhoneInput
                      value={field.state.value || ''}
                      onChange={field.handleChange}
                      defaultCountry="BR"
                      placeholder={t('phonePlaceholder')}
                    />
                  </div>
                )}
              </form.Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dados da LocaCamera</CardTitle>
            <CardDescription>
              Informações comerciais e cadastrais usadas pela operação e pela migração do EstoqueNow.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="cpfCnpj">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>
                      {customerType === 'business' ? 'CNPJ' : 'CPF'}
                    </Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      inputMode="numeric"
                      autoComplete="off"
                      value={field.state.value || ''}
                      maxLength={14}
                      onChange={(e) =>
                        field.handleChange(
                          e.target.value.replace(/\D/g, '').slice(0, 14) || undefined,
                        )
                      }
                      onBlur={field.handleBlur}
                      placeholder={customerType === 'business' ? '00000000000000' : '00000000000'}
                    />
                    <p className="text-sm text-muted-foreground">
                      Documento usado para identificar o cliente e vincular os dados migrados do EstoqueNow.
                    </p>
                  </div>
                )}
              </form.Field>

              <form.Field name="birthday">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Data de nascimento</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="date"
                      value={field.state.value || ''}
                      onChange={(e) => field.handleChange(e.target.value || undefined)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="gender">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Sexo</Label>
                    <Select
                      value={field.state.value || undefined}
                      onValueChange={(value) => {
                        if (value !== null) field.handleChange(value || undefined)
                      }}
                    >
                      <SelectTrigger id={field.name}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDER_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option} label={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>

              <form.AppField name="instagram">
                {(field) => <field.Input label="Instagram" placeholder="@usuario" />}
              </form.AppField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <form.AppField name="acquisitionSource">
                {(field) => <field.Input label="Como conheceu a loja" placeholder="Instagram, Google, indicação..." />}
              </form.AppField>

              <form.Field name="registeredAt">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Data de cadastro</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="date"
                      value={field.state.value || ''}
                      onChange={(e) => field.handleChange(e.target.value || undefined)}
                      onBlur={field.handleBlur}
                    />
                  </div>
                )}
              </form.Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <form.Field name="backupContact">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Contato de backup</Label>
                    <PhoneInput
                      value={field.state.value || ''}
                      onChange={field.handleChange}
                      defaultCountry="BR"
                      placeholder="Telefone ou WhatsApp alternativo"
                    />
                  </div>
                )}
              </form.Field>
            </div>

            <form.AppField name="pinnedFiles">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Arquivos fixados</Label>
                  <field.Textarea
                    placeholder="Cole links ou referências de arquivos, um por linha."
                    rows={4}
                  />
                  <p className="text-sm text-muted-foreground">
                    Aceita links e referências privadas trazidas do EstoqueNow/Wix. O upload direto de documentos será conectado ao storage depois.
                  </p>
                </div>
              )}
            </form.AppField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('addressSection')}</CardTitle>
            <CardDescription>{t('addressDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form.AppField name="address">
              {(field) => <field.Input label={t('address')} placeholder={t('addressPlaceholder')} />}
            </form.AppField>

            <div className="grid gap-4 sm:grid-cols-3">
              <form.AppField name="postalCode">
                {(field) => <field.Input label={t('postalCode')} placeholder={t('postalCodePlaceholder')} />}
              </form.AppField>
              <form.AppField name="city">
                {(field) => <field.Input label={t('city')} placeholder={t('cityPlaceholder')} />}
              </form.AppField>

              <form.Field name="country">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>{t('country')}</Label>
                    <Select
                      value={field.state.value || undefined}
                      onValueChange={(value) => { if (value !== null) field.handleChange(value || undefined) }}
                    >
                      <SelectTrigger id={field.name}>
                        <SelectValue placeholder={t('selectCountry')}>
                          {field.state.value ? countryLabel(field.state.value) : undefined}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRY_CODES.map((code) => (
                          <SelectItem key={code} value={code} label={countryLabel(code)}>
                            {countryLabel(code)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('internalNotes')}</CardTitle>
            <CardDescription>{t('internalNotesDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form.AppField name="notes">
              {(field) => <field.Textarea placeholder={t('notesPlaceholder')} rows={4} />}
            </form.AppField>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" isPending={isPending}>
            {isEditing ? t('save') : t('createCustomer')}
          </Button>
        </div>
      </form.Form>
    </form.AppForm>
  )
}
