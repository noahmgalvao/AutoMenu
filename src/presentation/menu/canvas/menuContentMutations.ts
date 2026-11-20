export function hasMenuContentMutation(records: MutationRecord[]) {
    return records.some(record => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target?.closest('[data-print-control]')) return false;
        if (record.type !== 'childList') return true;
        return [...record.addedNodes, ...record.removedNodes]
            .some(node => !(node instanceof Element && node.hasAttribute('data-print-control')));
    });
}
