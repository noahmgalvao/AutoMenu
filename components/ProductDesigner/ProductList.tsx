
import React from 'react';
import { Product, MenuStyle } from '../../types';
import { 
  GripVertical, MoreVertical, ChevronUp, ChevronDown, 
  Plus, Edit3, Trash2, Eye, EyeOff, ImagePlus, X
} from 'lucide-react';
import { EditForm } from './EditForm';
import { isPristineNewCategory, isPristineNewProduct } from '../../utils/pristineItems';

interface ProductListProps {
  categories: string[];
  grouped: Record<string, Product[]>;
  style: MenuStyle;
  handlers: any; // Return type from useMenuInteractions
  collapsedCategories: Set<string>;
  toggleCollapse: (cat: string) => void;
  editModeId: string | null;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
  formData: Partial<Product>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Product>>>;
  newItemDraft: { categoryId: string, type: 'product' | 'category', value: Partial<Product> } | null;
  
  // Actions
  startEdit: (id: string, initialData: Partial<Product>) => void;
  saveEdit: () => void;
  cancelEdit: () => void;
  remove: (id: string, type: 'product' | 'category') => void;
  handleToggleVisibility: (id: string, visible: boolean) => void;
  initiateAdd: (categoryId: string, type: 'product' | 'category') => void;
  onProductImageClick: (id: string) => void;
  onRemoveProductImage: (id: string) => void;
}

export const ProductList: React.FC<ProductListProps> = ({
  categories,
  grouped,
  style,
  handlers,
  collapsedCategories,
  toggleCollapse,
  editModeId,
  menuOpenId,
  setMenuOpenId,
  formData,
  setFormData,
  newItemDraft,
  startEdit,
  saveEdit,
  cancelEdit,
  remove,
  handleToggleVisibility,
  initiateAdd,
  onProductImageClick,
  onRemoveProductImage
}) => {
  const [shakingCategory, setShakingCategory] = React.useState<string | null>(null);

  React.useEffect(() => {
    const handleLimitReached = (e: Event) => {
      const customEvent = e as CustomEvent<{ category: string }>;
      setShakingCategory(customEvent.detail.category);
      setTimeout(() => setShakingCategory(null), 800);
    };
    window.addEventListener('menu-category-limit-reached', handleLimitReached);
    return () => window.removeEventListener('menu-category-limit-reached', handleLimitReached);
  }, []);

  return (
    <div
      className={`w-full min-w-0 overflow-x-hidden ${handlers.multiSelectMode ? 'select-none' : ''}`}
      data-drag-scope={handlers.dragScope}
      data-drag-column-container="category"
      data-drag-page-index={0}
      data-drag-column-index={0}
      onMouseDown={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey || handlers.multiSelectMode) {
          e.preventDefault();
        }
      }}
    >
      {categories.map((cat, catIndex) => {
        const isCollapsed = collapsedCategories.has(cat);
        const isEditing = editModeId === cat;
        const isSelected = handlers.isSelected?.('category', cat) ?? handlers.selectedId === cat;
        const isBeingDragged = handlers.draggedItem?.type === 'category' && handlers.draggedItem?.id === cat;
        
        // Determine if category is fully hidden (all products hidden)
        const productsInCat = grouped[cat] || [];
        const hiddenCount = productsInCat.filter(p => style.hiddenProductIds?.includes(p.id)).length;
        // Logic check: if category has products and all are hidden, it is effectively hidden.
        const isCatHidden = productsInCat.length > 0 && hiddenCount === productsInCat.length;
        const isPristineCategory = isPristineNewCategory(cat, Object.values(grouped).flat());
        const hasOpenMenuInCategory = menuOpenId === cat || productsInCat.some(product => product.id === menuOpenId);

        // Hide generated free text categories from this manager to reduce clutter
        if(cat.startsWith('ft_')) return null;

        return (
          <div 
            key={cat}
            id={cat}
            className={`relative mb-4 transition-all min-w-0 ${hasOpenMenuInCategory ? 'z-[120]' : 'z-0'} ${isCatHidden ? 'grayscale' : ''}`}
          >
            {/* Category Header */}
            <div className="flex items-center gap-2 group mb-2 min-w-0">
              <button 
                onClick={(e) => { e.stopPropagation(); toggleCollapse(cat); }}
                className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors"
                onPointerDown={e => e.stopPropagation()}
              >
                {isCollapsed ? <ChevronDown size={16}/> : <ChevronUp size={16}/>}
              </button>
              
              <div className="flex-1 relative min-w-0">
                {isEditing ? (
                  <EditForm 
                    type="category" 
                    formData={formData} 
                    setFormData={setFormData} 
                    saveEdit={saveEdit} 
                    cancelEdit={cancelEdit} 
                  />
                ) : (
                  <div
                    data-drag-scope={handlers.dragScope}
                    data-drag-type="category"
                    data-drag-id={cat}
                    data-drag-context="product-designer"
                    data-drag-page-index={0}
                    data-drag-column-index={0}
                    data-drag-flow-index={catIndex}
                    data-category-id={cat}
                    onPointerDown={(e) => handlers.handleDragStart(e, 'category', cat)}
                    onDragStart={(e) => e.preventDefault()}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`automenu-drag-item select-none touch-pan-y cursor-grab flex items-center justify-between p-2 bg-slate-100 border rounded-lg transition-all active:cursor-grabbing ${isCatHidden ? 'bg-slate-200 text-slate-400' : ''} ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 group-hover:border-indigo-300'} ${isBeingDragged ? 'opacity-40' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handlers.handleSelection('category', cat, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey || handlers.multiSelectMode }); }}
                  >
                    <div className="flex items-center gap-2 font-bold text-slate-700 text-sm min-w-0">
                      <GripVertical size={14} className="text-slate-400" />
                      <span className="truncate">{cat}</span>
                    </div>
                    <div className="relative">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === cat ? null : cat); }}
                        className="p-1 hover:bg-slate-200 rounded text-slate-500"
                        onPointerDown={e => e.stopPropagation()}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuOpenId === cat && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
                          <div className="absolute right-0 top-8 z-50 bg-white shadow-xl border border-slate-100 rounded-lg py-1 w-32 animate-in fade-in zoom-in-95 flex flex-col">
                            <button onPointerDown={(e) => e.stopPropagation()} onClick={() => { handlers.handleSelection('category', cat); startEdit(cat, { name: cat }); }} className="px-4 py-2 text-xs text-left hover:bg-slate-50 flex items-center gap-2"> <Edit3 size={14}/> Editar </button>
                            {!isPristineCategory && (
                              <button 
                                  onPointerDown={(e) => e.stopPropagation()} 
                                  onClick={() => handleToggleVisibility(cat, isCatHidden)} 
                                  className="px-4 py-2 text-xs text-left hover:bg-slate-50 text-slate-700 flex items-center gap-2"
                              > 
                                  {isCatHidden ? <Eye size={14}/> : <EyeOff size={14}/>} {isCatHidden ? 'Mostrar' : 'Ocultar'} 
                              </button>
                            )}
                            <button 
                              onClick={(e) => { 
                                e.preventDefault();
                                e.stopPropagation();
                                remove(cat, 'category'); 
                              }} 
                              className="px-4 py-2 text-xs text-left hover:bg-red-50 text-red-600 flex items-center gap-2"
                            > 
                              <Trash2 size={14}/> Remover
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {!isEditing && (
                <button 
                  onClick={(e) => { e.stopPropagation(); initiateAdd(cat, 'category'); }}
                  className="flex-shrink-0 p-1.5 bg-indigo-100 text-indigo-600 rounded-full hover:bg-indigo-200 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all"
                  title="Adicionar categoria abaixo"
                  onPointerDown={e => e.stopPropagation()}
                >
                  <Plus size={14} />
                </button>
              )}
            </div>

            {/* Products List */}
            <div className={`space-y-2 pl-8 border-l-2 border-slate-100 ml-3 transition-all duration-300 ${isCollapsed ? 'max-h-0 overflow-hidden opacity-0' : 'max-h-[2000px] opacity-100'}`}>
              {(grouped[cat] || []).filter(product => !product.isFreeText).map(product => {
                const pIsHidden = style.hiddenProductIds?.includes(product.id);
                const pIsEditing = editModeId === product.id;
                const productSelectionType = 'product';
                const pIsSelected = handlers.isSelected?.(productSelectionType, product.id) ?? handlers.selectedId === product.id;
                const isBeingDragged = handlers.draggedItem?.id === product.id;
                const isPristineProduct = isPristineNewProduct(product);
                
                return (
                  <div 
                    key={product.id} 
                    id={`product-container-${product.id}`}
                    className={`relative select-none ${menuOpenId === product.id ? 'z-[130]' : 'z-0'}`}
                  >
                    {pIsEditing ? (
                      <EditForm 
                        type="product" 
                        formData={formData} 
                        setFormData={setFormData} 
                        saveEdit={saveEdit} 
                        cancelEdit={cancelEdit} 
                      />
                    ) : (
                      <div 
                        data-drag-scope={handlers.dragScope}
                        data-drag-type="product"
                        data-drag-id={product.id}
                        data-drag-group={cat}
                        data-category-id={cat}
                        onPointerDown={(e) => handlers.handleDragStart(e, 'product', product.id, cat)}
                        onDragStart={(e) => e.preventDefault()}
                        onContextMenu={(e) => e.preventDefault()}
                        className={`automenu-drag-item touch-pan-y cursor-grab group flex items-start gap-3 p-2 bg-white border rounded-lg hover:shadow-sm transition-all relative ${pIsHidden ? 'bg-slate-50' : ''} ${pIsSelected ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/20' : 'border-slate-200'} ${isBeingDragged ? 'opacity-30' : ''}`}
                      >
                        {/* Image Thumbnail */}
                        <div 
                          className={`w-10 h-10 bg-slate-100 rounded flex-shrink-0 overflow-hidden cursor-pointer relative group/img ${pIsHidden ? 'grayscale opacity-60' : ''}`}
                          onClick={() => onProductImageClick(product.id)}
                          onPointerDown={e => e.stopPropagation()}
                        >
                          {product.image ? (
                            <img src={product.image} className="w-full h-full object-cover" alt="" draggable={false} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300"><ImagePlus size={16}/></div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white transition-opacity">
                            <Edit3 size={12} />
                          </div>
                        </div>
                        {product.image && (
                          <button 
                            onClick={() => onRemoveProductImage(product.id)}
                            className="absolute top-1 left-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
                            style={{ width: 14, height: 14 }}
                            title="Remover imagem"
                          >
                            <X size={10} />
                          </button>
                        )}

                        <div 
                          className={`flex-1 min-w-0 cursor-grab active:cursor-grabbing ${pIsHidden ? 'opacity-60' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handlers.handleSelection(productSelectionType, product.id, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey || handlers.multiSelectMode }); }}
                        >
                          <div className="flex justify-between items-start">
                            <h4 className="text-sm font-medium text-slate-800 truncate">{product.name}</h4>
                            <span className="text-xs font-mono font-bold text-slate-600">${product.price.toFixed(2)}</span>
                          </div>
                          <p className="text-xs text-slate-400 truncate">{product.description}</p>
                        </div>

                        {/* Options Menu */}
                        <div className="relative">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === product.id ? null : product.id); }}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                            onPointerDown={e => e.stopPropagation()}
                          >
                            <MoreVertical size={14} />
                          </button>
                          {menuOpenId === product.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
                              <div className="absolute right-0 top-8 z-[140] bg-white shadow-xl border border-slate-100 rounded-lg py-1 w-32 animate-in fade-in zoom-in-95 flex flex-col">
                                <button onPointerDown={(e) => e.stopPropagation()} onClick={() => { handlers.handleSelection(productSelectionType, product.id); startEdit(product.id, product); }} className="px-4 py-2 text-xs text-left hover:bg-slate-50 flex items-center gap-2"> <Edit3 size={14}/> Editar </button>
                                {!isPristineProduct && (
                                  <button 
                                      onPointerDown={(e) => e.stopPropagation()} 
                                      onClick={() => handleToggleVisibility(product.id, pIsHidden)} 
                                      className="px-4 py-2 text-xs text-left hover:bg-slate-50 text-slate-700 flex items-center gap-2"
                                  > 
                                      {pIsHidden ? <Eye size={14}/> : <EyeOff size={14}/>} {pIsHidden ? 'Mostrar' : 'Ocultar'} 
                                  </button>
                                )}
                                <button 
                                  onClick={(e) => { 
                                    e.preventDefault();
                                    e.stopPropagation(); 
                                    remove(product.id, 'product'); 
                                  }} 
                                  className="px-4 py-2 text-xs text-left hover:bg-red-50 text-red-600 flex items-center gap-2"
                                > 
                                  <Trash2 size={14}/> Remover
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              
              {/* Draft Form for New Product */}
              {newItemDraft?.type === 'product' && newItemDraft.categoryId === cat && (
                <EditForm 
                  type="product" 
                  formData={formData} 
                  setFormData={setFormData} 
                  saveEdit={saveEdit} 
                  cancelEdit={cancelEdit} 
                />
              )}
            
              {/* Add Item Button */}
              <button 
                onClick={() => initiateAdd(cat, 'product')}
                className={`w-full py-2 text-xs font-medium border border-dashed rounded transition-colors flex items-center justify-center gap-2 ${shakingCategory === cat ? 'animate-shake bg-red-50 border-red-500 text-red-600 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'text-slate-400 border-slate-300 hover:bg-slate-50 hover:text-indigo-600'}`}
              >
                <Plus size={14} /> {shakingCategory === cat ? 'Limite da página atingido' : 'Adicionar item'}
              </button>
            </div>
            
            {/* Render Category Draft Form OUTSIDE wrapper for correct position */}
            {newItemDraft?.type === 'category' && newItemDraft.categoryId === cat && (
              <div className="mb-4 ml-4 pl-4 border-l-2 border-indigo-200">
                <EditForm 
                  type="category" 
                  formData={formData} 
                  setFormData={setFormData} 
                  saveEdit={saveEdit} 
                  cancelEdit={cancelEdit} 
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
