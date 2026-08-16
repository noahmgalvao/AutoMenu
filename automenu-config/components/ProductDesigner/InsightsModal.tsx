
import React from 'react';
import { createPortal } from 'react-dom';
import { Product } from '../../types';
import { BarChart as BarChartIcon, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface InsightsModalProps {
  products: Product[];
  categories: string[];
  grouped: Record<string, Product[]>;
  onClose: () => void;
}

export const InsightsModal: React.FC<InsightsModalProps> = ({ products, categories, grouped, onClose }) => {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-lg flex items-center gap-2"><BarChartIcon size={20} className="text-indigo-600"/> Análises do cardápio</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
        </div>
        <div className="p-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="p-4 bg-indigo-50 rounded-lg text-center">
              <div className="text-3xl font-bold text-indigo-600">{products.length}</div>
              <div className="text-xs text-indigo-400 uppercase font-bold mt-1">Total de itens</div>
            </div>
            <div className="p-4 bg-emerald-50 rounded-lg text-center">
              <div className="text-3xl font-bold text-emerald-600">${(products.reduce((acc, p) => acc + p.price, 0) / (products.length || 1)).toFixed(2)}</div>
              <div className="text-xs text-emerald-400 uppercase font-bold mt-1">Preço médio</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg text-center">
              <div className="text-3xl font-bold text-blue-600">{categories.length}</div>
              <div className="text-xs text-blue-400 uppercase font-bold mt-1">Categorias</div>
            </div>
          </div>

          <div className="h-64 w-full mb-4">
            <h4 className="text-sm font-bold text-slate-500 mb-4 uppercase">Itens por categoria</h4>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categories.map(c => ({ name: c, count: grouped[c]?.length || 0 }))}>
                <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false}/>
                <Tooltip cursor={{fill: '#f1f5f9'}} contentStyle={{borderRadius: 8, border:'none', boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
