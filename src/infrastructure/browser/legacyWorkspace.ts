import type { WorkspaceBootstrapData } from '../../domain/workspace/model';
import type { Product, MenuStyle } from '../../domain/menu/model';
import {
  cloneJson,
  assignTemplateMetadata,
  assignCategoryIds,
  withStyleDefaults,
  mergeTemplates,
  DEFAULT_SORT_OPTION,
} from '../../application/workspace/state';
import { INITIAL_PRODUCTS, INITIAL_STYLE, PRESET_TEMPLATES } from '../../domain/menu/defaults';

const LOCAL_STORAGE_KEYS = {
  products: 'automenu_products',
  style: 'automenu_style',
  templates: 'automenu_templates',
  migrated: 'automenu_supabase_migrated',
} as const;

const parseLocalStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const markLocalStateAsMigrated = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LOCAL_STORAGE_KEYS.migrated, 'true');
  }
};

export const getLocalBootstrapData = (): WorkspaceBootstrapData => {
  const localProducts = parseLocalStorage<Product[]>(LOCAL_STORAGE_KEYS.products, cloneJson(INITIAL_PRODUCTS));
  const localStyle = parseLocalStorage<MenuStyle>(LOCAL_STORAGE_KEYS.style, cloneJson(INITIAL_STYLE));
  const localTemplates = assignTemplateMetadata(parseLocalStorage<MenuStyle[]>(LOCAL_STORAGE_KEYS.templates, cloneJson(PRESET_TEMPLATES)));

  return {
    products: assignCategoryIds(localProducts),
    style: withStyleDefaults(localStyle),
    templates: mergeTemplates(
      localTemplates.filter((template) => template.scope === 'workspace'),
      localTemplates.filter((template) => template.scope === 'system'),
    ),
    sortOption: DEFAULT_SORT_OPTION,
  };
};
