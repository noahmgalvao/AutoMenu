import React, { useState, useRef } from 'react';
import { Product, BulkEditConfig, MenuStyle } from '../types';
import { analyzeMenuImage, fileToGenerativePart } from '../services/geminiService';
import { getImageDimensions } from '../utils/imageProcessor';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Sparkles, 
  TrendingUp, 
  Image as ImageIcon,
  Loader2,
  EyeOff
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface DatabaseManagerProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  onStyleUpdate: (style: any) => void;
  currentStyle?: MenuStyle;
  setTemplates?: React.Dispatch<React.SetStateAction<MenuStyle[]>>;
}

const DatabaseManager: React.FC<DatabaseManagerProps> = ({ products, setProducts, onStyleUpdate, currentStyle, setTemplates }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk Edit State
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkConfig, setBulkConfig] = useState<BulkEditConfig>({ category: '', percentage: 0 });

  // Filter out free text items from DB view - STRICTLY
  const inventoryProducts = products.filter(p => !p.isFreeText);
  const categories = Array.from(new Set(inventoryProducts.map(p => p.category)));

  // Derived Statistics for Chart (Excluding free text)
  const chartData = categories.map(cat => ({
    name: cat,
    count: inventoryProducts.filter(p => p.category === cat).length,
    avgPrice: inventoryProducts.filter(p => p.category === cat).reduce((acc, curr) => acc + curr.price, 0) / inventoryProducts.filter(p => p.category === cat).length
  }));

  const handleSmartImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // 1. Convert to base64
      const base64Data = await fileToGenerativePart(file);
      const originalImageBase64 = `data:${file.type || 'image/png'};base64,${base64Data}`;
      const imageDimensions = await getImageDimensions(originalImageBase64);
      
      // 2. Analyze
      const result = await analyzeMenuImage(
        base64Data,
        file.type || 'image/png',
        imageDimensions,
      );
      
      // 3. Update Database (Merge)
      setProducts(prev => [...prev, ...result.products]);
      
      // 4. Create New Template & Apply IMMEDIATELY
      if (result.styleSuggestion && setTemplates) {
          const s = result.styleSuggestion;
          const colors = s.globalColors || {};
          const styles = s.typography || {};
          const layout = s.layout || {};
          const decorations = s.decorations || []; // Unused in this simplified block, but available

          // Extract Colors with Fallbacks
          const primaryColor = colors.primary || '#000000';
          const bgColor = colors.background || '#ffffff';
          const textColor = colors.text || '#1f2937';
          const accentColor = colors.secondary || primaryColor;

          // Extract Layout
          const layoutMode = 'list'; // Default
          const align = styles.category?.alignment || 'left';
          
          const newTemplate: MenuStyle = {
              id: crypto.randomUUID(),
              name: `Importado: ${new Date().toLocaleDateString()}`,
              menuTitle: styles.mainTitle?.text || 'CARDAPIO', 
              menuSubtitle: styles.subtitle?.text || '',
              fontFamily: styles.mainTitle?.fontFamily || 'Inter', // Dynamic Google Font
              primaryColor: primaryColor,
              backgroundColor: bgColor,
              textColor: textColor,
              // We rely on the AI's extracted background color unless an image is passed
              sourceImage: '', 
              backgroundImage: colors.backgroundType === 'image/texture' ? '' : '', 
              layoutMode: layoutMode,
              showImages: false, // Default to clean text
              columnCount: 1, // Product grid columns
              categoryColumnCount: (layout.categoryColumnCount as any) || 1, // NEW: Page columns
              customCategoryOrder: [],
              customProductOrder: {},
              hiddenProductIds: [],
              elementStyles: {
                  category: { 
                      fontSize: styles.category?.fontSize || 24, 
                      fontWeight: '700', 
                      textAlign: align, 
                      color: styles.category?.color || primaryColor,
                      fontFamily: styles.category?.fontFamily,
                      textTransform: styles.category?.textTransform || 'uppercase'
                  },
                  productName: { 
                      fontSize: styles.productName?.fontSize || 16, 
                      fontWeight: '600', 
                      textAlign: 'left', 
                      color: styles.productName?.color || textColor,
                      fontFamily: styles.productName?.fontFamily
                  },
                  productPrice: { 
                      fontSize: styles.productPrice?.fontSize || 16, 
                      fontWeight: '700', 
                      textAlign: 'right', 
                      color: styles.productPrice?.color || accentColor,
                      fontFamily: styles.productPrice?.fontFamily
                  },
                  productDescription: { 
                      fontSize: styles.productDescription?.fontSize || 12, 
                      fontWeight: '400', 
                      textAlign: 'left', 
                      color: styles.productDescription?.color || textColor,
                      fontFamily: styles.productDescription?.fontFamily,
                      italic: styles.productDescription?.fontStyle === 'italic'
                  }
              }
          };

          // Add to templates list at the top
          setTemplates(prev => [newTemplate, ...prev]);
          
          // FORCE APPLY the new template, overriding whatever was there
          onStyleUpdate(newTemplate);
          
          alert("Cardápio digitalizado. O design foi atualizado para combinar com a foto.");
      } else {
        alert(`${result.products.length} produtos importados com sucesso.`);
      }

    } catch (error) {
      console.error(error);
      alert("Falha ao analisar a imagem. Tente novamente.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBulkUpdate = () => {
    if (!bulkConfig.category || bulkConfig.percentage === 0) return;

    setProducts(prev => prev.map(p => {
      if (p.category === bulkConfig.category) {
        const multiplier = 1 + (bulkConfig.percentage / 100);
        return { ...p, price: parseFloat((p.price * multiplier).toFixed(2)) };
      }
      return p;
    }));
    setShowBulkEdit(false);
  };

  const handleSaveProduct = () => {
    if (!formData.name || !formData.price || !formData.category) return;

    if (editingId) {
      setProducts(prev => prev.map(p => p.id === editingId ? { ...p, ...formData } as Product : p));
    } else {
      const newProduct: Product = {
        id: crypto.randomUUID(),
        name: formData.name!,
        price: parseFloat(formData.price.toString()),
        category: formData.category!,
        description: formData.description || '',
        image: formData.image || `https://picsum.photos/200/200?random=${Date.now()}`
      };
      setProducts(prev => [...prev, newProduct]);
    }
    setEditingId(null);
    setFormData({});
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setFormData(product);
  };

  const deleteProduct = (id: string) => {
    if (window.confirm("Tem certeza? Isso removera o item do banco de dados permanentemente.")) {
        setProducts(prev => prev.filter(p => p.id !== id));
    }
  };

  return (
    <div className="space-y-8">
      
      {/* Action Header */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Banco de produtos</h2>
          <p className="text-slate-500 text-sm mt-1">Gerencie o inventario manualmente ou importe com IA.</p>
        </div>
        
        <div className="flex gap-3">
          <button 
            onClick={() => setShowBulkEdit(!showBulkEdit)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium text-sm"
          >
            <TrendingUp size={16} />
            Ajuste em massa
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg shadow-md transition-all font-medium text-sm"
          >
            {isUploading ? <Loader2 className="animate-spin" size={16}/> : <Sparkles size={16} />}
            Importar foto com IA
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*"
            onChange={handleSmartImport}
          />
        </div>
      </div>

      {/* Stats Chart */}
      {inventoryProducts.length > 0 && (
         <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Visao geral do banco</h3>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%" minHeight={200} minWidth={100}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    cursor={{fill: '#f1f5f9'}}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
         </div>
      )}

      {/* Bulk Edit Modal */}
      {showBulkEdit && (
        <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-xl animate-fade-in">
           <h3 className="font-semibold text-indigo-900 mb-4 flex items-center gap-2">
             <TrendingUp size={18} /> Ajuste inteligente de preços
           </h3>
           <div className="flex flex-col md:flex-row gap-4 items-end">
             <div className="flex-1 w-full">
               <label className="block text-xs font-bold text-indigo-700 mb-1">Categoria</label>
               <select 
                 className="w-full p-2 rounded-lg border-indigo-200 focus:ring-2 focus:ring-indigo-500 text-sm"
                 value={bulkConfig.category}
                 onChange={(e) => setBulkConfig(prev => ({...prev, category: e.target.value}))}
               >
                 <option value="">Selecionar categoria</option>
                 {categories.map(c => <option key={c} value={c}>{c}</option>)}
               </select>
             </div>
             <div className="flex-1 w-full">
               <label className="block text-xs font-bold text-indigo-700 mb-1">Aumento percentual (%)</label>
               <input 
                  type="number" 
                  className="w-full p-2 rounded-lg border-indigo-200 focus:ring-2 focus:ring-indigo-500 text-sm"
                  placeholder="ex.: 10"
                  value={bulkConfig.percentage}
                  onChange={(e) => setBulkConfig(prev => ({...prev, percentage: Number(e.target.value)}))}
               />
             </div>
             <button 
                onClick={handleBulkUpdate}
                className="w-full md:w-auto px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition-colors"
             >
               Aplicar
             </button>
           </div>
        </div>
      )}

      {/* Product List / Edit Form */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        
        {/* Form */}
        <div className="p-4 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
           <div className="md:col-span-3">
             <input 
                placeholder="Nome do produto" 
                className="w-full p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm"
                value={formData.name || ''}
                onChange={e => setFormData(prev => ({...prev, name: e.target.value}))}
             />
           </div>
           <div className="md:col-span-2">
             <input 
                placeholder="Categoria" 
                className="w-full p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm"
                value={formData.category || ''}
                onChange={e => setFormData(prev => ({...prev, category: e.target.value}))}
                list="category-list"
             />
             <datalist id="category-list">
                {categories.map(c => <option key={c} value={c} />)}
             </datalist>
           </div>
           <div className="md:col-span-2">
             <input 
                type="number"
                placeholder="Preço"
                className="w-full p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm"
                value={formData.price || ''}
                onChange={e => setFormData(prev => ({...prev, price: parseFloat(e.target.value)}))}
             />
           </div>
           <div className="md:col-span-4">
             <input 
                placeholder="Descrição"
                className="w-full p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 text-sm"
                value={formData.description || ''}
                onChange={e => setFormData(prev => ({...prev, description: e.target.value}))}
             />
           </div>
           <div className="md:col-span-1">
             <button 
               onClick={handleSaveProduct}
               className="w-full flex items-center justify-center p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
             >
               {editingId ? <Edit2 size={18} /> : <Plus size={18} />}
             </button>
           </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50">
              <tr>
                <th className="px-6 py-3">Imagem</th>
                <th className="px-6 py-3">Nome</th>
                <th className="px-6 py-3">Categoria</th>
                <th className="px-6 py-3">Preço</th>
                <th className="px-6 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {inventoryProducts.map(product => {
                const isHidden = currentStyle?.hiddenProductIds?.includes(product.id);

                return (
                <tr key={product.id} className={`bg-white border-b hover:bg-slate-50 transition-colors ${isHidden ? 'opacity-50 grayscale' : ''}`}>
                  <td className="px-6 py-4">
                    {product.image ? (
                        <img src={product.image} alt={product.name} className="w-10 h-10 rounded-full object-cover border border-slate-200" />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                            <ImageIcon size={16} />
                        </div>
                    )}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-2">
                    {product.name}
                    {isHidden && <span title="Oculto no cardápio atual"><EyeOff size={14} className="text-slate-400" /></span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-slate-100 rounded-full text-xs font-semibold text-slate-600">
                      {product.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-emerald-600 font-bold">
                    ${product.price.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    <button 
                      onClick={() => startEdit(product)}
                      className="p-1 hover:bg-blue-50 text-blue-600 rounded transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => deleteProduct(product.id)}
                      className="p-1 hover:bg-red-50 text-red-600 rounded transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              )})}
              {inventoryProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-400">
                    Nenhum produto ainda. Adicione manualmente ou escaneie um cardápio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DatabaseManager;
