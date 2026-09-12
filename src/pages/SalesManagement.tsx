import React, { useState, useEffect } from 'react';
import { ShoppingCart, Save, Trash2, Package, AlertCircle } from 'lucide-react';
import { supabase, Product } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { validateInput, logSecurityEvent } from '../utils/security';
import toast from 'react-hot-toast';

interface SoldeEntry {
  id: string;
  product: Product;
  soldeQuantity: number;
}

export default function SalesManagement() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [soldeEntries, setSoldeEntries] = useState<SoldeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [soldeQuantity, setSoldeQuantity] = useState<number | string>('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('status', 'approved')
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      toast.error('Error loading products');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSoldeEntry = () => {
    if (!selectedProductId) {
      toast.error('Please select a product');
      return;
    }

    const soldeQty = Number(soldeQuantity);
    
    if (soldeQuantity === '' || isNaN(soldeQty)) {
      toast.error('Please enter a valid quantity');
      return;
    }

    if (soldeQty < 0) {
      toast.error('Solde quantity cannot be negative');
      return;
    }

    const selectedProduct = products.find(p => p.id === selectedProductId);
    if (!selectedProduct) {
      toast.error('Selected product not found');
      return;
    }

    const existingEntryIndex = soldeEntries.findIndex(entry => entry.product.id === selectedProductId);
    
    if (existingEntryIndex >= 0) {
      const updatedEntries = [...soldeEntries];
      updatedEntries[existingEntryIndex].soldeQuantity = soldeQty;
      setSoldeEntries(updatedEntries);
      toast.success('Solde entry updated');
    } else {
      const newEntry: SoldeEntry = {
        id: Date.now().toString(),
        product: selectedProduct,
        soldeQuantity: soldeQty
      };
      setSoldeEntries([...soldeEntries, newEntry]);
      toast.success('Solde entry added');
    }

    setSelectedProductId('');
    setSoldeQuantity('');
  };

  const handleRemoveEntry = (entryId: string) => {
    setSoldeEntries(soldeEntries.filter(entry => entry.id !== entryId));
    toast.success('Entry removed');
  };

  const handleUpdateSolde = (entryId: string, newSolde: number) => {
    if (newSolde < 0) {
      toast.error('Solde quantity cannot be negative');
      return;
    }

    setSoldeEntries(soldeEntries.map(entry => 
      entry.id === entryId 
        ? { ...entry, soldeQuantity: newSolde }
        : entry
    ));
  };

  const handleSubmitAll = async () => {
    if (soldeEntries.length === 0) {
      toast.error('Please add at least one solde entry');
      return;
    }

    if (!user) {
      toast.error('User not authenticated');
      return;
    }

    // Validate user permissions
    if (!['admin', 'manager', 'worker'].includes(user.role)) {
      toast.error('Insufficient permissions');
      return;
    }
    setSubmitting(true);
    try {

      for (const entry of soldeEntries) {
        const currentQuantity = entry.product.quantity;
        const newSoldeQuantity = entry.soldeQuantity;
        
        // Validate quantities
        const quantityValidation = validateInput.quantity(newSoldeQuantity);
        if (!quantityValidation.isValid) {
          logSecurityEvent('sales_invalid_quantity', { product_id: entry.product.id });
          throw new Error(`Invalid quantity for ${entry.product.name}: ${quantityValidation.error}`);
        }
        
        const difference = newSoldeQuantity - currentQuantity;
        
        if (difference !== 0) {
          const adjustmentType = difference > 0 ? 'increase' : 'decrease';
          const adjustmentQuantity = Math.abs(difference);


          const { error: updateError } = await supabase
            .from('products')
            .update({ 
              quantity: newSoldeQuantity,
              updated_at: new Date().toISOString()
            })
            .eq('id', entry.product.id);

          if (updateError) throw updateError;

          const adjustmentData = {
            product_id: entry.product.id,
            product_name: entry.product.name,
            adjustment_type: adjustmentType,
            quantity_adjusted: adjustmentQuantity,
            previous_quantity: currentQuantity,
            new_quantity: newSoldeQuantity,
            reason: 'Solde adjustment from Sales Management',
            adjusted_by: user.id,
            adjusted_by_name: user.full_name,
            created_at: new Date().toISOString()
          };


          const { error: adjustmentError } = await supabase
            .from('stock_adjustments')
            .insert([adjustmentData]);

          if (adjustmentError) throw adjustmentError;
        }
      }

      toast.success(`Successfully updated solde for ${soldeEntries.length} products`);
      
      logSecurityEvent('sales_submit_success', { entries_count: soldeEntries.length });
      setSoldeEntries([]);
      await fetchProducts();
      
    } catch (error) {
      logSecurityEvent('sales_submit_failure');
      toast.error('Error updating solde entries');
    } finally {
      setSubmitting(false);
    }
  };

  const getTotalEntries = () => soldeEntries.length;
  const getTotalSoldeValue = () => soldeEntries.reduce((sum, entry) => sum + (entry.soldeQuantity * entry.product.price), 0);

  const availableProducts = products.filter(product => 
    !soldeEntries.some(entry => entry.product.id === product.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-8 w-full min-w-0">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900">Sales Management</h1>
          <p className="text-gray-600 lg:text-lg">Manage product solde (stock balance) and update daily reports</p>
          <p className="text-sm lg:text-base text-blue-600 mt-1">
            📊 Solde changes will be reflected in Daily Reports for all users • All data stored in localStorage
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 lg:p-8">
        <div className="flex items-center mb-4">
          <Package className="h-5 w-5 text-blue-600 mr-2" />
          <h2 className="text-lg lg:text-xl font-semibold text-gray-900">Add Solde Entry</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Product
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 lg:px-4 lg:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Choose a product...</option>
              {availableProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - Current: {product.quantity} - ${product.price}
                </option>
              ))}
            </select>
            {availableProducts.length === 0 && products.length > 0 && (
              <p className="text-sm text-orange-600 mt-1">
                All products have been added to solde entries
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Solde Quantity
            </label>
            <input
              type="number"
              min="0"
              value={soldeQuantity}
              onChange={(e) => setSoldeQuantity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter new solde quantity"
            />
            <p className="text-xs text-gray-500 mt-1">
              Set the final stock balance for this product
            </p>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleAddSoldeEntry}
              disabled={!selectedProductId || soldeQuantity === ''}
              className="w-full inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Package className="h-4 w-4 mr-2" />
              Add Entry
            </button>
          </div>
        </div>

        {selectedProductId && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            {(() => {
              const selectedProduct = products.find(p => p.id === selectedProductId);
              if (!selectedProduct) return null;
              
              const newSoldeQty = Number(soldeQuantity) || 0;
              const difference = newSoldeQty - selectedProduct.quantity;
              
              return (
                <div className="text-sm">
                  <p className="font-medium text-blue-900 mb-1">Selected: {selectedProduct.name}</p>
                  <div className="grid grid-cols-3 gap-4 text-blue-700">
                    <div>
                      <span className="text-blue-600">Current Stock:</span>
                      <span className="font-medium ml-1">{selectedProduct.quantity}</span>
                    </div>
                    <div>
                      <span className="text-blue-600">New Solde:</span>
                      <span className="font-medium ml-1">{newSoldeQty}</span>
                    </div>
                    <div>
                      <span className="text-blue-600">Change:</span>
                      <span className={`font-medium ml-1 ${
                        difference > 0 ? 'text-green-600' : difference < 0 ? 'text-red-600' : 'text-gray-600'
                      }`}>
                        {difference > 0 ? '+' : ''}{difference}
                        {difference > 0 ? ' (Increase)' : difference < 0 ? ' (Decrease)' : ' (No Change)'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {soldeEntries.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Solde Entries</h2>
                <p className="text-sm text-gray-600">
                  {getTotalEntries()} products • Total value: ${getTotalSoldeValue().toFixed(2)}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <span className="text-sm text-orange-600">Changes pending submission</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Current Stock
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    New Solde
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Change
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Adjustment Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {soldeEntries.map((entry) => {
                  const difference = entry.soldeQuantity - entry.product.quantity;
                  const value = entry.soldeQuantity * entry.product.price;
                  const adjustmentType = difference > 0 ? 'Increase' : difference < 0 ? 'Decrease' : 'No Change';
                  
                  return (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{entry.product.name}</div>
                          <div className="text-sm text-gray-500">{entry.product.category}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {entry.product.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="number"
                          min="0"
                          value={entry.soldeQuantity}
                          onChange={(e) => handleUpdateSolde(entry.id, Number(e.target.value))}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium ${
                          difference > 0 ? 'text-green-600' : difference < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {difference > 0 ? '+' : ''}{difference}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          difference > 0 ? 'bg-green-100 text-green-800' : 
                          difference < 0 ? 'bg-red-100 text-red-800' : 
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {adjustmentType}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${value.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleRemoveEntry(entry.id)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                          title="Remove entry"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                <p>Ready to submit {soldeEntries.length} solde entries</p>
                <p className="text-xs text-blue-600">
                  ⚠️ This will update product quantities and create stock adjustment records for Daily Reports (visible to all users)
                </p>
              </div>
              <button
                onClick={handleSubmitAll}
                disabled={submitting || soldeEntries.length === 0}
                className="inline-flex items-center px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="h-4 w-4 mr-2" />
                {submitting ? 'Submitting...' : 'Submit All Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {soldeEntries.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center">
            <ShoppingCart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Solde Entries</h3>
            <p className="text-gray-600 mb-4">
              Select products and set their new solde quantities to get started
            </p>
            <p className="text-sm text-blue-600">
              💡 Solde represents the final stock balance you want to set for each product
            </p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-blue-400 mt-0.5" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">
              How Solde Management Works (LocalStorage)
            </h3>
            <div className="mt-2 text-sm text-blue-700">
              <ul className="list-disc list-inside space-y-1">
                <li>Set the final stock quantity (solde) you want for each product</li>
                <li>The system calculates the difference and creates appropriate stock adjustments</li>
                <li>All changes are stored in localStorage and will appear in Daily Reports for all users</li>
                <li>Positive changes create "increase" adjustments, negative changes create "decrease" adjustments</li>
                <li>All data persists in your browser's localStorage</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}