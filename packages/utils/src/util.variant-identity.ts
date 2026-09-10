import { normalizeAxisKey } from "./variants";

export const VARIANT_PRESET_ALIASES = {
  size: ["Taille", "Größe", "Talla", "Taglia", "Maat", "Rozmiar", "Tamanho"],
  "shoe-size": [
    "Pointure",
    "Shoe size",
    "Schuhgröße",
    "Número de calzado",
    "Numero di scarpe",
    "Schoenmaat",
    "Rozmiar buta",
    "Tamanho do calçado",
  ],
  color: ["Couleur", "Farbe", "Colore", "Kleur", "Kolor", "Cor"],
  material: ["Matière", "Material", "Materiale", "Materiaal", "Materiał"],
} as const;

const identityByKey = new Map(
  Object.entries(VARIANT_PRESET_ALIASES).flatMap(([key, aliases]) =>
    [key, ...aliases].map((alias) => [normalizeAxisKey(alias), key] as const),
  ),
);

/** Compare known aliases without changing the keys stored on units or reservations. */
export const getVariantAxisIdentity = (key: string): string => {
  const normalized = normalizeAxisKey(key);
  return identityByKey.get(normalized) ?? normalized;
};

/** Exact keys take precedence when a catalog contains several historical definitions. */
export const findMatchingVariant = <T extends { key: string }>(
  key: string,
  candidates: readonly T[],
): T | undefined => {
  const normalized = normalizeAxisKey(key);
  const identity = getVariantAxisIdentity(key);
  return (
    candidates.find((candidate) => normalizeAxisKey(candidate.key) === normalized) ??
    candidates.find((candidate) => normalizeAxisKey(candidate.key) === identity) ??
    candidates.find((candidate) => getVariantAxisIdentity(candidate.key) === identity)
  );
};
