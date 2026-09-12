import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { supabase, clearCache } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sanitizeInput, validateInput, logSecurityEvent } from '../../utils/security';
import toast from 'react-hot-toast';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ProductFormData {
  name: string;
  price: number;
  quantity: number;
  category: string;
  description?: string;
}

export default function AddProductModal({ isOpen, onClose, onSuccess }: AddProductModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const { register, handleSubmit, formState: { errors }, reset } = useForm<ProductFormData>();

  const onSubmit = async (data: ProductFormData) => {
    // Security: Validate user session and permissions
    if (!user?.id) {
      toast.error('Authentication required');
      onClose();
      return;
    }

    // Security: Validate user permissions
    if (!['admin', 'manager', 'worker'].includes(user.role)) {
      toast.error('Insufficient permissions');
      return;
    }

    // Security: Validate and sanitize input data
    if (!data.name?.trim() || !data.category?.trim()) {
      toast.error('Product name and category are required');
      return;
    }

    if (data.price <= 0 || data.quantity < 0) {
      toast.error('Invalid price or quantity values');
      return;
    }

    setLoading(true);
    try {
      // Security: Sanitize inputs
      const sanitizedData = {
        name: data.name.trim().substring(0, 100), // Limit length
        price: Math.max(0.01, Number(data.price)),
        quantity: Math.max(0, Math.floor(Number(data.quantity))),
        category: data.category.trim().substring(0, 50),
        description: data.description?.trim().substring(0, 500) || null
      };

      // Create the product - always approved now
      const { data: productData, error: productError } = await supabase
        .from('products')
        .insert([{
          name: sanitizedData.name,
          price: sanitizedData.price,
          quantity: sanitizedData.quantity,
          category: sanitizedData.category,
          description: sanitizedData.description,
          status: 'approved', // Always approved
          created_by: user.id,
        }])
        .select()
        .single();

      if (productError) throw productError;

      // If product has quantity > 0, record it as a stock adjustment (entres)
      if (productData && sanitizedData.quantity > 0) {
        const { error: adjustmentError } = await supabase
          .from('stock_adjustments')
          .insert([{
            product_id: productData.id,
            product_name: sanitizedData.name,
            adjustment_type: 'increase',
            quantity_adjusted: sanitizedData.quantity,
            previous_quantity: 0,
            new_quantity: sanitizedData.quantity,
            reason: 'Initial stock entry for new product',
            adjusted_by: user.id,
            adjusted_by_name: user.full_name
          }]);

        if (adjustmentError) {
          console.warn('Stock adjustment recording failed');
        }
      }

      toast.success(`Product added successfully! ${sanitizedData.quantity > 0 ? 'Initial stock recorded as entres.' : ''}`);
      
      logSecurityEvent('product_add_success', { product_name: sanitizedData.name });
      reset();
      onSuccess();
    } catch (error) {
      logSecurityEvent('product_add_failure');
      toast.error('Failed to add product. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-md mx-auto my-8 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white rounded-t-xl flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Add New Product</h2>
            <p className="text-sm text-blue-600 mt-1">
              📊 Initial quantity will be recorded as "entres" in Daily Reports
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Name
              </label>
              <input
                {...register('name', { required: 'Product name is required' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter product name"
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  {...register('price', { 
                    required: 'Price is required',
                    min: { value: 0.01, message: 'Price must be greater than 0' }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
                {errors.price && (
                  <p className="text-red-500 text-sm mt-1">{errors.price.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Initial Quantity
                </label>
                <input
                  type="number"
                  {...register('quantity', { 
                    required: 'Quantity is required',
                    min: { value: 0, message: 'Quantity cannot be negative' }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0"
                />
                {errors.quantity && (
                  <p className="text-red-500 text-sm mt-1">{errors.quantity.message}</p>
                )}
                <p className="text-xs text-blue-600 mt-1">
                  Will appear as "entres" in reports
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                {...register('category', { required: 'Category is required' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select category</option>
                <option value="Electronics">Electronics</option>
                <option value="Clothing">Clothing</option>
                <option value="Food & Beverages">Food & Beverages</option>
                <option value="Home & Garden">Home & Garden</option>
                <option value="Sports">Sports</option>
                <option value="Books">Books</option>
                <option value="Other">Other</option>
              </select>
              {errors.category && (
                <p className="text-red-500 text-sm mt-1">{errors.category.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (Optional)
              </label>
              <textarea
                {...register('description')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter product description"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">📊 Daily Reports Integration</p>
                <p>When you add this product with initial quantity, it will:</p>
                <ul className="list-disc list-inside mt-1 space-y-1 text-xs">
                  <li>Create the product in your inventory (automatically approved)</li>
                  <li>Record the initial quantity as "entres" (new stock entries)</li>
                  <li>Appear in today's Daily Report with proper entres tracking</li>
                </ul>
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit(onSubmit)}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Adding...' : 'Add Product'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}