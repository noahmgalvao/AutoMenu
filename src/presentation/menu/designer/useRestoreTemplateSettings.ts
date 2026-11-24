import type { Dispatch, SetStateAction } from 'react';
import { getAppliedTemplateId } from '../../../application/templates/templateApplication';
import { INITIAL_STYLE, PRESET_TEMPLATES } from '../../../domain/menu/defaults';
import type { MenuStyle } from '../../../domain/menu/model';
import {
  resolveFontSizeLimits, resolveMenuContentSpacing, resolveMenuMargins, resolveMinimumFontSize,
} from '../../../domain/menu/styleRules';
import { useAppServices } from '../../app/AppServicesProvider';

export const restoreGeneralRules = (current: MenuStyle, template: MenuStyle): MenuStyle => ({
  ...current,
  name: 'Custom',
  margins: resolveMenuMargins(template),
  contentSpacing: resolveMenuContentSpacing(template),
  showPrices: template.showPrices ?? true,
  splitCategoryAcrossPages: template.splitCategoryAcrossPages ?? INITIAL_STYLE.splitCategoryAcrossPages,
  productsCanChangeCategory: template.productsCanChangeCategory ?? INITIAL_STYLE.productsCanChangeCategory,
  allowSameWordBreak: template.allowSameWordBreak ?? false,
  minimumFontSize: resolveMinimumFontSize(template),
  fontSizeLimits: resolveFontSizeLimits(template),
});

export function useRestoreTemplateSettings(style: MenuStyle, setStyle: Dispatch<SetStateAction<MenuStyle>>,
  templates: MenuStyle[], workspaceId?: string) {
  const { workspace: { loadTemplateVersion } } = useAppServices();
  return async (restore: (current: MenuStyle, template: MenuStyle) => MenuStyle) => {
    const id = getAppliedTemplateId(style) ?? style.id;
    const versionId = style.appliedTemplateVersionId;
    const template = templates.find(candidate => candidate.id === id)
      || PRESET_TEMPLATES.find(candidate => candidate.id === id);
    const historical = workspaceId && versionId && versionId !== template?.templateVersionId
      ? await loadTemplateVersion({ workspaceId, versionId }).catch(() => null) : null;
    setStyle(current => current.id !== style.id || (getAppliedTemplateId(current) ?? current.id) !== id
      || current.appliedTemplateVersionId !== versionId
      ? current : restore(current, historical || template || INITIAL_STYLE));
  };
}
