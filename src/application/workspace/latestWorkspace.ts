import type { Menu } from '../../domain/workspace/model';

export function isRemoteMenuNewer(remote: Menu, local: Menu) {
    if (remote.id !== local.id) return false;
    if (remote.revisionWriteVersion !== undefined && local.revisionWriteVersion !== undefined
        && remote.revisionWriteVersion !== local.revisionWriteVersion) return remote.revisionWriteVersion > local.revisionWriteVersion;
    return (Date.parse(remote.updatedAt) || 0) > (Date.parse(local.updatedAt) || 0)
        || remote.currentDraftVersionId !== local.currentDraftVersionId;
}

export function canRestorePendingWorkspace(pending: { expectedWrite?: number; updatedAt: string } | null,
    menu: Menu, versionCreatedAt: string) {
    if (!pending) return false;
    if (pending.expectedWrite !== undefined && menu.revisionWriteVersion !== undefined) {
        return pending.expectedWrite === menu.revisionWriteVersion;
    }
    return (Date.parse(pending.updatedAt) || 0) > Math.max(Date.parse(menu.updatedAt) || 0, Date.parse(versionCreatedAt) || 0);
}
