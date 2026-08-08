
import React from 'react';
import { Product } from '../../types';
import { X, Check } from 'lucide-react';

interface EditFormProps {
  type: 'product' | 'category';
  formData: Partial<Product>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Product>>>;
  saveEdit: () => void;
  cancelEdit: () => void;
}

export const EditForm: React.FC<EditFormProps> = ({
  type,
  formData,
  setFormData,
  saveEdit,
  cancelEdit
}) => {
  return (
    <div 
      className="flex flex-col gap-2 p-3 bg-white border-2 border-indigo-500 rounded-lg shadow-lg animate-in fade-in zoom-in-95" 
      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
    >
      <input 
        autoFocus
        className="w-full font-bold text-sm border-b border-slate-200 focus:border-indigo-500 outline-none pb-1"
        placeholder={type === 'category' ? "Nome da categoria" : "Nome do produto"}
        value={formData.name || ''}
        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
      />
      {type === 'product' && (
        <>
          <input 
            className="w-full text-xs border-b border-slate-200 focus:border-indigo-500 outline-none pb-1"
            placeholder="Descrição"
            value={formData.description || ''}
            onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">$</span>
            <input 
              type="number"
              className="w-20 text-xs font-mono border-b border-slate-200 focus:border-indigo-500 outline-none pb-1"
              placeholder="0.00"
              value={formData.price || ''}
              onChange={e => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
            />
          </div>
        </>
      )}
      <div className="flex justify-end gap-2 mt-1">
        <button onClick={cancelEdit} className="p-1 text-red-500 hover:bg-red-50 rounded"><X size={14}/></button>
        <button onClick={saveEdit} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={14}/></button>
      </div>
    </div>
  );
};
