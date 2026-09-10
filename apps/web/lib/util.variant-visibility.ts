import { findMatchingVariant } from '@louez/utils';

import { VARIANT_PRESETS } from '@/lib/variant-presets';

interface VariantActivityDefinition {
  key: string;
  label?: string;
  isActive: boolean;
}

interface VariantVisibilityDefault {
  key: string;
  label?: string;
  aliases?: readonly string[];
  defaultActive: boolean;
}

export const filterActiveVariantAxes = <
  TAxis extends { key: string; label: string },
>(
  axes: readonly TAxis[],
  definitions: readonly VariantActivityDefinition[],
  defaults: readonly VariantVisibilityDefault[] = VARIANT_PRESETS,
): TAxis[] => {
  return axes.filter((axis) => {
    const definition = findMatchingVariant(axis.key, definitions);
    if (definition) return definition.isActive;
    return findMatchingVariant(axis.key, defaults)?.defaultActive ?? true;
  });
};

export const pickActiveVariantAttributes = (
  axes: readonly { key: string }[],
  attributes: Readonly<Record<string, string>>,
): Record<string, string> =>
  Object.fromEntries(
    axes.flatMap((axis) => {
      const value = attributes[axis.key];
      return value ? [[axis.key, value] as const] : [];
    }),
  );
