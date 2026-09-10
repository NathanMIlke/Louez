import { VARIANT_PRESET_ALIASES } from '@louez/utils';

export type VariantPresetId = 'size' | 'shoeSize' | 'color' | 'material';

export type VariantPresetValueSeed =
  | {
      /** Literal label, locale-independent (e.g. "XS", "42"). */
      label: string;
      key?: never;
      colorHex?: string;
    }
  | {
      /** Translation key under unitTracking.presets.<id>.values when localized. */
      key: string;
      label?: never;
      colorHex?: string;
    };

export interface ResolvedVariantPreset {
  id: VariantPresetId;
  key: string;
  aliases: readonly string[];
  kind: 'size' | 'color' | 'custom';
  label: string;
  defaultActive: boolean;
  values: Array<{ label: string; colorHex: string | null }>;
}

export interface VariantPreset {
  id: VariantPresetId;
  /** Locale-independent key stored in variant definitions and product axes. */
  key: string;
  /** Historical localized keys that may already be persisted. */
  aliases: readonly string[];
  kind: 'size' | 'color' | 'custom';
  defaultActive: boolean;
  values: VariantPresetValueSeed[];
}

type VariantPresetTranslator = (key: string) => string;

export const resolveVariantPresets = (
  translate: VariantPresetTranslator,
): ResolvedVariantPreset[] =>
  VARIANT_PRESETS.map((preset) => ({
    id: preset.id,
    key: preset.key,
    aliases: preset.aliases,
    kind: preset.kind,
    label: translate(`presets.${preset.id}.label`),
    defaultActive: preset.defaultActive,
    values: preset.values.map((value) => ({
      label:
        value.label ?? translate(`presets.${preset.id}.values.${value.key}`),
      colorHex: value.colorHex ?? null,
    })),
  }));

/**
 * System presets offered in the variant picker. Labels and localized value
 * names resolve client-side via unitTracking.presets.* translations. Taille
 * and Couleur are available by default; the other presets must be enabled
 * explicitly from the shared variant manager.
 */
export const VARIANT_PRESETS: VariantPreset[] = [
  {
    id: 'size',
    key: 'size',
    aliases: VARIANT_PRESET_ALIASES['size'],
    kind: 'size',
    defaultActive: true,
    values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((label) => ({ label })),
  },
  {
    id: 'shoeSize',
    key: 'shoe-size',
    aliases: VARIANT_PRESET_ALIASES['shoe-size'],
    kind: 'size',
    defaultActive: false,
    values: Array.from({ length: 11 }, (_, i) => ({ label: String(36 + i) })),
  },
  {
    id: 'color',
    key: 'color',
    aliases: VARIANT_PRESET_ALIASES['color'],
    kind: 'color',
    defaultActive: true,
    values: [
      { key: 'black', colorHex: '#171717' },
      { key: 'white', colorHex: '#FAFAFA' },
      { key: 'gray', colorHex: '#6B7280' },
      { key: 'red', colorHex: '#EF4444' },
      { key: 'orange', colorHex: '#F97316' },
      { key: 'yellow', colorHex: '#EAB308' },
      { key: 'green', colorHex: '#22C55E' },
      { key: 'blue', colorHex: '#3B82F6' },
      { key: 'purple', colorHex: '#8B5CF6' },
      { key: 'pink', colorHex: '#EC4899' },
      { key: 'brown', colorHex: '#92400E' },
      { key: 'beige', colorHex: '#D6C7A1' },
    ],
  },
  {
    id: 'material',
    key: 'material',
    aliases: VARIANT_PRESET_ALIASES['material'],
    kind: 'custom',
    defaultActive: false,
    values: [
      'cotton',
      'leather',
      'wood',
      'metal',
      'plastic',
      'aluminum',
      'carbon',
    ].map((key) => ({
      key,
    })),
  },
];
