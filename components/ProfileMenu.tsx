import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ChevronDown, Loader2, LogOut, Pencil, Plus, Settings, Trash2, User, X } from 'lucide-react';
import type { Menu, Profile, Workspace } from '../types';

interface ProfileMenuProps {
  profile: Profile;
  workspace: Workspace;
  menus: Menu[];
  activeMenuId: string;
  isOpen: boolean;
  loading?: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelectMenu: (menuId: string) => void;
  onCreateMenu: () => void;
  onRenameMenu: (menuId: string, name: string) => Promise<void>;
  onDeleteMenu: (menuId: string) => Promise<void>;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

export const ProfileMenu: React.FC<ProfileMenuProps> = ({
  profile,
  workspace,
  menus,
  activeMenuId,
  isOpen,
  loading = false,
  onToggle,
  onClose,
  onSelectMenu,
  onCreateMenu,
  onRenameMenu,
  onDeleteMenu,
  onOpenSettings,
  onSignOut,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [menuToDelete, setMenuToDelete] = useState<Menu | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, onClose]);

  const startEditing = (menu: Menu) => {
    setEditingMenuId(menu.id);
    setEditingName(menu.name);
  };

  const cancelEditing = () => {
    setEditingMenuId(null);
    setEditingName('');
  };

  const commitRename = async () => {
    if (!editingMenuId) return;

    const nextName = editingName.trim();
    const currentMenu = menus.find((menu) => menu.id === editingMenuId);

    if (nextName && currentMenu && nextName !== currentMenu.name) {
      await onRenameMenu(editingMenuId, nextName);
    }

    cancelEditing();
  };

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitRename();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditing();
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <User size={16} />
        <span className="hidden sm:inline">Meu perfil</span>
        <ChevronDown size={14} className={isOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-[80] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900 truncate">
              {profile.fullName || 'Meu perfil'}
            </div>
            <div className="text-xs text-slate-500 truncate">
              {workspace.name}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto px-2 py-2">
            <div className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              Meus cardápios
            </div>

            <div className="space-y-1">
              {menus.map((menu) => {
                const isActive = menu.id === activeMenuId;
                const isEditing = editingMenuId === menu.id;

                return (
                  <div
                    key={menu.id}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    {isEditing ? (
                      <>
                        <input
                          autoFocus
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={handleRenameKeyDown}
                          onBlur={() => void commitRename()}
                          disabled={loading}
                          className="min-w-0 flex-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
                        />
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => void commitRename()}
                          disabled={loading}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-50"
                          title="Salvar nome"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={cancelEditing}
                          disabled={loading}
                          className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg disabled:opacity-50"
                          title="Cancelar"
                        >
                          <X size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onSelectMenu(menu.id)}
                          disabled={loading}
                          className="min-w-0 flex-1 text-left text-sm font-medium truncate disabled:opacity-50"
                        >
                          {menu.name}
                        </button>
                        {isActive && <Check size={15} className="shrink-0" />}
                        <button
                          type="button"
                          onClick={() => startEditing(menu)}
                          disabled={loading}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg disabled:opacity-50"
                          title="Renomear"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setMenuToDelete(menu)}
                          disabled={loading}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                          title="Excluir cardápio"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onCreateMenu}
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Novo cardápio
            </button>
          </div>

          <div className="border-t border-slate-100 p-2">
            <button
              type="button"
              onClick={onOpenSettings}
              disabled={loading}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50"
            >
              <Settings size={16} />
              Configurações
            </button>
            <button
              type="button"
              onClick={onSignOut}
              disabled={loading}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <LogOut size={16} />
              Sair
            </button>
          </div>

          {menuToDelete && createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" onPointerDown={(event) => event.stopPropagation()}>
              <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-2xl">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <AlertTriangle size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Excluir cardápio?</h3>
                <p className="mt-2 text-sm text-slate-500">Tem certeza que deseja apagar “{menuToDelete.name}”?</p>
                <div className="mt-5 flex gap-3">
                  <button type="button" onClick={() => setMenuToDelete(null)} disabled={loading} className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                  <button type="button" onClick={() => void onDeleteMenu(menuToDelete.id).then(() => setMenuToDelete(null))} disabled={loading} className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                    {loading ? <Loader2 size={16} className="mx-auto animate-spin" /> : 'Excluir'}
                  </button>
                </div>
              </div>
            </div>
          , document.body)}
        </div>
      )}
    </div>
  );
};
