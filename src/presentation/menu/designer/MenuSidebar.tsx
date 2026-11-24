import type { FormattingKind, FormattingScope } from '../../../domain/menu/itemFormatting';
import { SaveTemplateDialog } from './MenuDesignDialog';
import { GeneralRulesDialog, RulesLayoutEditor, type RulesLayoutSection } from './GeneralRules';
import { DesignerTapButton } from '../../common/DesignerTapButton';
import { preventBrowserContextMenu } from '../../common/noBrowserSelection';
import type { CanvasShape } from '../../../domain/menu/model';
import { TemplatePicker } from './TemplatePicker';
import React, { useState } from 'react';
import type { MenuStyle, Product, ElementStyle, SortOption, AddedImage } from '../../../domain/menu/model';
import { FileText, Maximize2, Minimize2, Paintbrush, RotateCcw, Settings, X } from 'lucide-react';
import { useBottomSheetDrag } from '../../common/useBottomSheetDrag';
import { 
  ElementsSection, 
  PageSection,
  LayoutSection, 
  StyleSection, 
  SortingSection
} from './SidebarSections';
import { resolveFontSizeLimits, resolveMinimumFontSize } from '../../../domain/menu/styleRules';

interface MenuSidebarProps {
    isOpen: boolean;
    onClose?: () => void;
    onSaveTemplate?: (name: string, description: string, id: string, publish: boolean) => Promise<void>;
    onPublishTemplate?: (id: string) => Promise<void>;
    onPdfClick?: () => void;
    handleResetDesign: () => void;
    restoreRuleDefaults: () => void;
    onRulesLayoutEditingChange: (editing: boolean) => void;
    
    // Data Props
    style: MenuStyle;
    setStyle: React.Dispatch<React.SetStateAction<MenuStyle>>;
    templates: MenuStyle[];
    products: Product[];
    currentUserId: string;
    applyTemplate: (template: MenuStyle) => void;
    sortOption: SortOption;
    setSortOption: React.Dispatch<React.SetStateAction<SortOption>>;
    
    // Selection Props
    selection: { type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null };
    setSelection: (selection: { type: 'product' | 'category' | 'freeText' | 'addedImage' | 'page' | 'menuTitle' | 'menuSubtitle' | null, id: string | null }) => void;
    formattingScope: { value: FormattingScope; group?: number; change: (scope: FormattingScope) => void } | null;
    itemStyle: (kind: FormattingKind) => MenuStyle;
    setSidebarFormatting: (kind: FormattingKind, update: React.SetStateAction<MenuStyle>) => void;
    selectedFreeText: Product | null;
    selectedAddedImage: AddedImage | null;
    selectedAddedImageIds: string[];
    
    // Handlers
    updateFreeTextStyle: (id: string, newStyle: ElementStyle) => void | boolean;
    updateGlobalElementStyle: (elementType: keyof MenuStyle['elementStyles'], newStyle: ElementStyle) => void | boolean;
    setPreviewAction: React.Dispatch<React.SetStateAction<{ type: string, id: number } | undefined>>;
    shapePickerRequest: { id: string } | null;
    onChangeShape: (id: string) => void;
    onAddShape: (shape: CanvasShape) => void;
    onMovePhotoToBackground: (id: string) => void;
    handleAddedImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isAddingImage: boolean;
    resizeSelectedAddedImages: (delta: number) => boolean;
    removeSelectedAddedImages: () => void;
    layerSelectedAddedImages: (direction: 'front' | 'back') => void;
}

export const MenuSidebar: React.FC<MenuSidebarProps> = ({
    isOpen, onClose, onPdfClick, handleResetDesign, restoreRuleDefaults, onRulesLayoutEditingChange,
    style, setStyle, templates, applyTemplate, onSaveTemplate, onPublishTemplate, sortOption, setSortOption, products, currentUserId,
    selection, setSelection, selectedFreeText, selectedAddedImage, selectedAddedImageIds,
    formattingScope, itemStyle, setSidebarFormatting,
    updateFreeTextStyle, updateGlobalElementStyle, setPreviewAction, onMovePhotoToBackground, handleAddedImageUpload, isAddingImage, onAddShape, shapePickerRequest, onChangeShape,
    resizeSelectedAddedImages, removeSelectedAddedImages, layerSelectedAddedImages
}) => {
    
    const [rulesSnapshot, setRulesSnapshot] = useState<MenuStyle | null>(null);
    const [rulesSection, setRulesSection] = useState<RulesLayoutSection | null>(null);
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [savedTemplate, setSavedTemplate] = useState(false);
    const { sheetRef, height, isMobile, isExpanded, openPartial, toggleExpanded, dragHandlers } = useBottomSheetDrag(isOpen, onClose);

    const closeRules = () => {
        setRulesSnapshot(null);
        setRulesSection(null);
        onRulesLayoutEditingChange(false);
    };

    React.useEffect(() => {
        if (isOpen) return;
        setRulesSnapshot(null);
        setRulesSection(null);
        onRulesLayoutEditingChange(false);
    }, [isOpen, onRulesLayoutEditingChange]);

    const resetRulesSection = (section: RulesLayoutSection) => {
        if (!rulesSnapshot) return;
        if (section === 'margins') {
            if (style.margins === rulesSnapshot.margins && style.pagePadding === rulesSnapshot.pagePadding) return;
            setStyle(current => ({ ...current, margins: rulesSnapshot.margins, pagePadding: rulesSnapshot.pagePadding, name: 'Custom' }));
        } else {
            if (style.contentSpacing === rulesSnapshot.contentSpacing && style.itemGap === rulesSnapshot.itemGap) return;
            setStyle(current => ({ ...current, contentSpacing: rulesSnapshot.contentSpacing, itemGap: rulesSnapshot.itemGap, name: 'Custom' }));
        }
    };

    React.useEffect(() => {
        if (shapePickerRequest) {
            openPartial();
            document.querySelector('[data-change-shape-picker]')?.scrollIntoView({ block: 'nearest' });
        }
    }, [shapePickerRequest, openPartial]);

    // Safe accessors with defaults
    const safeStyles = style.elementStyles || {
        category: { fontSize: 24, fontWeight: '700' as const, textAlign: 'left' as const },
        productName: { fontSize: 18, fontWeight: '700' as const, textAlign: 'left' as const },
        productPrice: { fontSize: 18, fontWeight: '700' as const, textAlign: 'right' as const },
        productDescription: { fontSize: 14, fontWeight: '400' as const, textAlign: 'left' as const },
    };
    const fontSizeLimits = resolveFontSizeLimits(style);
    const minimumFontSize = resolveMinimumFontSize(style);

    return (
        <div ref={sheetRef} id="designer-sheet-visual" data-designer-sheet data-sheet-open={isOpen} inert={!isOpen} data-no-browser-selection onContextMenu={preventBrowserContextMenu}
            className={`
                flex flex-col bg-white overflow-hidden
                /* Mobile: Bottom Sheet */
                fixed bottom-0 left-0 right-0 z-40 max-md:max-h-[var(--automenu-max-sheet-height,100dvh)]
                rounded-t-2xl shadow-2xl border-t border-slate-200
                md:transition-all
                md:relative md:inset-auto md:h-full md:z-20 md:shadow-xl md:rounded-none md:border-t-0 md:border-r md:pt-16
                ${isOpen ? 'md:w-80 lg:md:w-96 md:opacity-100' : 'md:w-0 md:opacity-0'}
            `}
            style={{ height: isMobile ? height : undefined }}
        >
        {rulesSection ? <RulesLayoutEditor style={style} setStyle={setStyle} section={rulesSection}
          reset={() => resetRulesSection(rulesSection)} close={closeRules} confirm={() => {
            setRulesSection(null);
            onRulesLayoutEditingChange(false);
          }} />
        : <>
        <div 
            className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center flex-shrink-0 min-w-0 touch-none cursor-grab active:cursor-grabbing"
            {...dragHandlers}
        >
          <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm pointer-events-none min-w-0 truncate">
            <Paintbrush size={16} /> Visual
          </h2>
          <div className="flex shrink-0 gap-1.5">
            <button type="button" onClick={() => setRulesSnapshot(style)} onPointerDown={e => e.stopPropagation()}
                aria-label="Configurações do cardápio" title="Configurações do cardápio"
                className="grid h-8 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100">
                <Settings size={16} />
            </button>
            <button type="button" onClick={onPdfClick} className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 pointer-events-auto" onPointerDown={e => e.stopPropagation()} title="Exportar PDF"><FileText size={14} /> PDF</button>
            <DesignerTapButton type="button" onClick={toggleExpanded} aria-expanded={isExpanded} className="md:hidden h-8 w-8 rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 pointer-events-auto flex items-center justify-center" onPointerDown={e => e.stopPropagation()} title={isExpanded ? 'Voltar à visualização parcial' : 'Expandir painel'} aria-label={isExpanded ? 'Voltar à visualização parcial' : 'Expandir painel'}>{isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</DesignerTapButton>
            <DesignerTapButton type="button" onClick={onClose} className="md:hidden h-8 w-8 rounded-lg text-slate-500 hover:bg-white hover:text-slate-800 pointer-events-auto flex items-center justify-center" onPointerDown={e => e.stopPropagation()} title="Fechar painel" aria-label="Fechar painel"><X size={18} /></DesignerTapButton>
          </div>
        </div>

        <div data-designer-scroll-container className="overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 space-y-6 custom-scrollbar flex-grow pb-24 md:pb-10 min-w-0">
          
          <ElementsSection 
            selection={selection}
            setSelection={setSelection}
            selectedFreeText={selectedFreeText}
            selectedAddedImage={selectedAddedImage}
            selectedAddedImageIds={selectedAddedImageIds}
            formattingScope={formattingScope}
            itemStyle={itemStyle}
            setSidebarFormatting={setSidebarFormatting}
            safeStyles={safeStyles}
            fontSizeLimits={fontSizeLimits}
            minimumFontSize={minimumFontSize}
            fontFamily={style.fontFamily}
            style={style}
            setStyle={setStyle}
            updateFreeTextStyle={updateFreeTextStyle}
            updateGlobalElementStyle={updateGlobalElementStyle}
            setPreviewAction={setPreviewAction}
            onMovePhotoToBackground={onMovePhotoToBackground}
            onAddedImageUpload={handleAddedImageUpload}
            isAddingImage={isAddingImage}
            onChangeShape={onChangeShape}
            shapePickerRequest={shapePickerRequest}
            onAddShape={onAddShape}
            resizeSelectedAddedImages={resizeSelectedAddedImages}
            removeSelectedAddedImages={removeSelectedAddedImages}
            layerSelectedAddedImages={layerSelectedAddedImages}
          />

          <hr className="border-slate-100" />

          <section className="space-y-2">
            <TemplatePicker key={currentUserId} userId={currentUserId} current={style} templates={templates}
              applyTemplate={applyTemplate} products={products} sortOption={sortOption} onPublishTemplate={onPublishTemplate} />
            {onSaveTemplate && <button type="button" onClick={() => { setSavedTemplate(false); setSavingTemplate(true); }}
              className="rounded-md px-2 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Salvar como modelo</button>}
            {savedTemplate && <p role="status" className="text-xs font-medium text-emerald-700">Modelo salvo</p>}
          </section>

          <hr className="border-slate-100" />

          <PageSection
            style={style}
            setStyle={setStyle}
            products={products}
          />

          <hr className="border-slate-100" />

          <LayoutSection 
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
             manualProductOrder={style.manualProductOrder}
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
        </>}
        {rulesSnapshot && !rulesSection && <GeneralRulesDialog
          style={style} setStyle={setStyle} close={closeRules} reset={resetRulesSection} restoreDefaults={restoreRuleDefaults}
          edit={section => {
            if (isExpanded) openPartial();
            setRulesSection(section);
            onRulesLayoutEditingChange(true);
          }}
        />}
        {savingTemplate && onSaveTemplate && <SaveTemplateDialog close={() => setSavingTemplate(false)} canPublish={Boolean(onPublishTemplate)}
          save={async (...values) => { await onSaveTemplate(...values); setSavingTemplate(false); setSavedTemplate(true); }} />}
      </div>
    );
};
