import { lockModalScrolling } from '../common/modalScroll';

import React from 'react';
import { createPortal } from 'react-dom';
import type { MenuStyle, Product } from '../../domain/menu/model';
import { BarChart as BarChartIcon, X } from 'lucide-react';
import { BarChart, Bar, Rectangle, XAxis, YAxis, ResponsiveContainer, type BarShapeProps } from 'recharts';
import { formatMenuPrice } from '../../domain/menu/price';
import { categoryName } from '../../domain/menu/categoryName';

interface InsightsModalProps {
  products: Product[];
  categories: string[];
  grouped: Record<string, Product[]>;
  style: MenuStyle;
  onClose: () => void;
}

export const InsightsModal: React.FC<InsightsModalProps> = ({ products, categories, grouped, style, onClose }) => {
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const data = categories.map(id => ({ id, name: categoryName(id), count: grouped[id]?.length || 0 }));
  const selected = data.find(category => category.id === selectedCategory);

  const selectColumn = ({ x, y, width, height, index }: BarShapeProps) => {
    const category = data[index];
    if (!category) return null;
    const activate = () => setSelectedCategory(category.id);
    return <rect x={x} y={y} width={width} height={height} fill="transparent"
      data-insights-column={category.id} role="button" tabIndex={0} aria-pressed={category.id === selectedCategory}
      aria-label={`${category.name}, ${category.count} ${category.count === 1 ? 'item' : 'itens'}`}
      className="cursor-pointer outline-none focus-visible:[fill:#eef2ff]"
      onClick={activate} onKeyDown={event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate();
      }} />;
  };

  const renderBar = ({ x, y, width, height, index }: BarShapeProps) => {
    const active = data[index]?.id === selectedCategory;
    return <Rectangle x={x} y={y} width={width} height={height} radius={[6, 6, 0, 0]}
      fill={active ? '#4f46e5' : '#a5b4fc'} stroke={active ? '#312e81' : undefined}
      strokeWidth={active ? 2 : undefined} pointerEvents="none" data-insights-selected-bar={active ? '' : undefined} />;
  };

  return createPortal(
    <div ref={lockModalScrolling}
      role="dialog" aria-modal="true" aria-label="Análises do cardápio"
      className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in"
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
              <div className="text-3xl font-bold text-emerald-600">
                {formatMenuPrice(products.reduce((acc, p) => acc + p.price, 0) / (products.length || 1), style)}
              </div>
              <div className="text-xs text-emerald-400 uppercase font-bold mt-1">Preço médio</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg text-center">
              <div className="text-3xl font-bold text-blue-600">{categories.length}</div>
              <div className="text-xs text-blue-400 uppercase font-bold mt-1">Categorias</div>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <h4 className="mb-2 text-sm font-semibold text-slate-700">Itens por categoria</h4>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} accessibilityLayer={false}>
                  <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
                  <Bar dataKey="count" name="Contagem" shape={renderBar} background={selectColumn} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div aria-live="polite" className="min-h-7 text-sm">
              {selected && <p className="inline-flex flex-wrap items-center gap-x-2 rounded-md bg-indigo-50 px-2 py-1 text-indigo-900">
                <span className="font-semibold">{selected.name}</span>
                <span>{selected.count} {selected.count === 1 ? 'item' : 'itens'}</span>
              </p>}
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
};
