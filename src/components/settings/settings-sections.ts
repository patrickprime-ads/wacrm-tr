import {
  Coins,
  FileText,
  LayoutGrid,
  Palette,
  PlugZap,
  Package,
  Radio,
  Workflow,
  Webhook,
  Shield,
  Tags,
  User,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

/**
 * Settings information architecture for the redesigned page.
 *
 * The flat tab strip became a grouped left rail with a new Overview
 * landing. The URL query param stays `?tab=` (deep-linkable, and it
 * keeps the existing links in sidebar.tsx / header.tsx working) — we
 * just map the old values onto the new sections.
 */
export const SETTINGS_SECTIONS = [
  'overview',
  'profile',
  'security',
  'appearance',
  'whatsapp',
  'integrations',
  'broadcasts',
  'products',
  'flows',
  'templates',
  'fields',
  'deals',
  'members',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'overview';

export const PUBLIC_SECTION_SLUG: Record<SettingsSection, string> = {
  overview: 'visao-geral',
  profile: 'perfil',
  security: 'seguranca',
  appearance: 'aparencia',
  whatsapp: 'whatsapp',
  integrations: 'integracoes',
  broadcasts: 'disparos',
  products: 'produtos',
  flows: 'fluxos',
  templates: 'modelos',
  fields: 'campos-e-tags',
  deals: 'vendas-e-valores',
  members: 'equipe',
};

/** Rail grouping. `adminOnly` items are hidden for non-admins. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: 'top' | 'account' | 'workspace';
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  overview: { id: 'overview', label: 'Visão geral', icon: LayoutGrid, group: 'top' },
  profile: { id: 'profile', label: 'Seu perfil', icon: User, group: 'account' },
  security: { id: 'security', label: 'Login e segurança', icon: Shield, group: 'account' },
  appearance: { id: 'appearance', label: 'Aparência', icon: Palette, group: 'account' },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', icon: PlugZap, group: 'workspace' },
  integrations: { id: 'integrations', label: 'Integrações', icon: Webhook, group: 'workspace' },
  broadcasts: { id: 'broadcasts', label: 'Disparos', icon: Radio, group: 'workspace' },
  products: { id: 'products', label: 'Produtos', icon: Package, group: 'workspace' },
  flows: { id: 'flows', label: 'Fluxos', icon: Workflow, group: 'workspace' },
  templates: { id: 'templates', label: 'Modelos', icon: FileText, group: 'workspace' },
  fields: { id: 'fields', label: 'Campos e tags', icon: Tags, group: 'workspace' },
  deals: { id: 'deals', label: 'Vendas e valores', icon: Coins, group: 'workspace' },
  members: { id: 'members', label: 'Membros da equipe', icon: UsersRound, group: 'workspace' },
};

export const RAIL_GROUPS: { label: string | null; group: SectionMeta['group'] }[] = [
  { label: null, group: 'top' },
  { label: 'Conta', group: 'account' },
  { label: 'Área de trabalho', group: 'workspace' },
];

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` value to a section. Legacy tabs from the old
 * flat layout collapse onto their new home (Tags + Custom fields → the
 * merged "Fields & tags" section). Anything unknown falls back to the
 * Overview landing.
 */
export function resolveSection(raw: string | null): SettingsSection {
  if (raw === 'tags' || raw === 'custom-fields') return 'fields';
  if (isSection(raw)) return raw;
  const localized = SETTINGS_SECTIONS.find(
    (section) => PUBLIC_SECTION_SLUG[section] === raw,
  );
  if (localized) return localized;
  return DEFAULT_SECTION;
}
