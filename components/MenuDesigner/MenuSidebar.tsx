import React from 'react';
import { MenuStyle, Product, ElementStyle, SortOption, AddedImage } from '../../types';
import { Layout, PanelLeftClose, Printer, RotateCcw } from 'lucide-react';
import { useBottomSheetDrag } from '../../hooks/useBottomSheetDrag';
import { 
  ElementsSection, 
  TemplatesSection, 
  LayoutSection, 
  GeneralRulesSection,
  StyleSection, 
  SortingSection 
} from './SidebarSections';
import { resolveFontSizeLimits } from '../../utils/styleRules';

interface MenuSidebarProps {
    isOpen: boolean;
    onClose?: () => void;
    handlePrint: () => void;
    handleResetDesign: () => void;
    
    // Data Props
    style: MenuStyle;
    setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
    templates: MenuStyle[];
    applyTemplate: (template: MenuStyle) => void;
    sortOption: SortOption;
    setSortOption: React.Dispatch<React.SetStateAction<SortOption>>;
    
    // Selection Props
    selection: { type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null };
    setSelection: (selection: { type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null }) => void;
    selectedFreeText: Product | null;
    selectedAddedImage: AddedImage | null;
    selectedAddedImageIds: string[];
    
    // Handlers
    updateFreeTextStyle: (id: string, newStyle: ElementStyle) => void;
    updateGlobalElementStyle: (elementType: keyof MenuStyle['elementStyles'], newStyle: ElementStyle) => void;
    setPreviewAction: React.Dispatch<React.SetStateAction<{ type: string, id: number } | undefined>>;
    handleAddedImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleImageResize: (delta: number) => void;
    resizeSelectedAddedImages: (delta: number) => void;
    removeSelectedAddedImages: () => void;
    layerSelectedAddedImages: (direction: 'front' | 'back') => void;
}

export const MenuSidebar: React.FC<MenuSidebarProps> = ({
    isOpen, onClose, handlePrint, handleResetDesign,
    style, setStyle, templates, applyTemplate, sortOption, setSortOption,
    selection, setSelection, selectedFreeText, selectedAddedImage, selectedAddedImageIds,
    updateFreeTextStyle, updateGlobalElementStyle, setPreviewAction, handleAddedImageUpload, handleImageResize,
    resizeSelectedAddedImages, removeSelectedAddedImages, layerSelectedAddedImages
}) => {
    
    const { height, isDragging, isMobile, dragHandlers } = useBottomSheetDrag(isOpen, onClose);

    // Safe accessors with defaults
    const safeStyles = style.elementStyles || {
        category: { fontSize: 24, fontWeight: '700' as const, textAlign: 'left' as const },
        productName: { fontSize: 18, fontWeight: '700' as const, textAlign: 'left' as const },
        productPrice: { fontSize: 18, fontWeight: '700' as const, textAlign: 'right' as const },
        productDescription: { fontSize: 14, fontWeight: '400' as const, textAlign: 'left' as const },
    };
    const fontSizeLimits = resolveFontSizeLimits(style);

    return (
        <div 
            className={`
                flex flex-col bg-white overflow-hidden
                /* Mobile: Bottom Sheet */
                fixed bottom-0 left-0 right-0 z-40
                rounded-t-2xl shadow-2xl border-t border-slate-200
                transform transition-transform
                ${isOpen ? 'translate-y-0' : 'translate-y-full'}

                /* Desktop Overrides */
                md:translate-y-0 md:transform-none md:transition-all
                md:relative md:inset-auto md:h-full md:z-20 md:shadow-xl md:rounded-none md:border-t-0 md:border-r md:pt-16
                ${isOpen ? 'md:w-80 lg:md:w-96 md:opacity-100' : 'md:w-0 md:opacity-0'}
            `}
            style={{ 
                // CRITICAL FIX: Always maintain valid height. Visibility is handled by translateY.
                height: isMobile ? height : undefined,
                transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s ease-out, opacity 0.3s ease-out'
            }}
        >
        <div 
            className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center flex-shrink-0 min-w-0 touch-none cursor-grab active:cursor-grabbing"
            {...dragHandlers}
        >
          <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm pointer-events-none">
            <Layout size={16} /> Controles de design
          </h2>
          <div className="flex gap-2">
            <button onClick={onClose} className="md:hidden text-slate-500 hover:text-slate-800 pointer-events-auto" onPointerDown={e => e.stopPropagation()}> <PanelLeftClose size={18} /> </button>
            <button onClick={handlePrint} className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded hover:bg-slate-800 flex items-center gap-1 pointer-events-auto" onPointerDown={e => e.stopPropagation()}> <Printer size={12} /> PDF </button>
          </div>
        </div>

        <div className="overflow-y-auto overflow-x-hidden p-4 space-y-6 custom-scrollbar flex-grow pb-24 md:pb-10 min-w-0">
          
          <ElementsSection 
            selection={selection}
            setSelection={setSelection}
            selectedFreeText={selectedFreeText}
            selectedAddedImage={selectedAddedImage}
            selectedAddedImageIds={selectedAddedImageIds}
            safeStyles={safeStyles}
            fontSizeLimits={fontSizeLimits}
            setStyle={setStyle}
            updateFreeTextStyle={updateFreeTextStyle}
            updateGlobalElementStyle={updateGlobalElementStyle}
            setPreviewAction={setPreviewAction}
            onAddedImageUpload={handleAddedImageUpload}
            resizeSelectedAddedImages={resizeSelectedAddedImages}
            removeSelectedAddedImages={removeSelectedAddedImages}
            layerSelectedAddedImages={layerSelectedAddedImages}
          />

          <hr className="border-slate-100" />

          <TemplatesSection 
            templates={templates}
            currentStyleId={style.id}
            applyTemplate={applyTemplate}
          />

          <hr className="border-slate-100" />

          <LayoutSection 
            style={style}
            setStyle={setStyle}
            handleImageResize={handleImageResize}
          />

          <hr className="border-slate-100" />

          <GeneralRulesSection
            style={style}
            setStyle={setStyle}
          />

          <hr className="border-slate-100" />

          <StyleSection 
            style={style}
            setStyle={setStyle}
          />

          <hr className="border-slate-100" />

           <SortingSection 
             sortOption={sortOption}
             setSortOption={setSortOption}
             setStyle={setStyle}
           />

          {/* Reset Button (Bottom of Scroll) */}
          <div className="mt-8 pt-6 border-t border-slate-200 relative z-50">
             <button 
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.nativeEvent.stopImmediatePropagation();
                    e.stopPropagation();
                    console.log("!!! RESET BUTTON CLICKED !!!");
                    if (window.confirm("Redefinir os estilos do layout para o padrão? Seus textos e itens serão mantidos.")) {
                        handleResetDesign();
                    }
                }}
                className="w-full py-3 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 flex items-center justify-center gap-2 transition-colors font-medium text-sm relative z-50"
                title="Restaurar padrão do modelo"
            > 
                <RotateCcw size={16} /> Restaurar estilos do modelo
            </button>
          </div>

        </div>
      </div>
    );
};
