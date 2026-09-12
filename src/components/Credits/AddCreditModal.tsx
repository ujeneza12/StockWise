import React, { useState, useEffect } from 'react';
import { X, CreditCard, User, DollarSign, Package } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { supabase, getProducts, clearCache, Product } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sanitizeInput, logSecurityEvent } from '../../utils/security';
import toast from 'react-hot-toast';

interface AddCreditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CreditFormData {
  customer_name: string;
  product_id: string;
  amount: number;
  due_date: string;
  notes?: string;
}

export default function AddCreditModal({ isOpen, onClose, onSuccess }: AddCreditModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm<CreditFormData>({
    defaultValues: {
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 30 days from now
    }
  });

  const watchProductId = watch('product_id');

  useEffect(() => {
    if (isOpen) {
      fetchProducts();
    }
  }, [isOpen]);

  useEffect(() => {
    if (watchProductId) {
      const product = products.find(p => p.id === watchProductId);
      setSelectedProduct(product || null);
    }
  }, [watchProductId, products]);

  const fetchProducts = async () => {
    try {
      const products = await getProducts();
      setProducts(products);
    } catch (error) {
      toast.error('Error loading products');
    }
  };

  const onSubmit = async (data: CreditFormData) => {
    // Security: Validate user session and permissions
    if (!user?.id) {
      toast.error('Authentication required');
      onClose();
      return;
    }

    if (!selectedProduct) {
      toast.error('Please select a product');
      return;
    }

    // Security: Validate user permissions
    if (!['admin', 'manager', 'worker'].includes(user.role)) {
      toast.error('Insufficient permissions');
      return;
    }

    // Security: Validate and sanitize input data
    if (!data.customer_name?.trim()) {
      toast.error('Customer name is required');
      return;
    }

    if (data.amount <= 0) {
      toast.error('Credit amount must be greater than 0');
      return;
    }

    const dueDate = new Date(data.due_date);
    const today = new Date();
    if (dueDate < today) {
      toast.error('Due date cannot be in the past');
      return;
    }

    setLoading(true);
    try {
      // Security: Sanitize inputs
      const sanitizedData = {
        customer_name: data.customer_name.trim().substring(0, 100),
        amount: Math.max(0.01, Number(data.amount)),
        due_date: data.due_date
      };

      const { error } = await supabase
        .from('credits')
        .insert([{
          customer_name: sanitizedData.customer_name,
          product_name: selectedProduct.name,
          amount: sanitizedData.amount,
          due_date: sanitizedData.due_date,
          issued_by: user.id,
          status: 'pending',
          sale_id: null
        }]);

      if (error) throw error;

      toast.success('Credit added successfully!');
      logSecurityEvent('credit_add_success', { 
        customer_name: sanitizedData.customer_name,
        amount: sanitizedData.amount 
      });
      
      // Clear cache to ensure fresh data
      clearCache();
      reset();
      setSelectedProduct(null);
      onSuccess();
    } catch (error) {
      logSecurityEvent('credit_add_failure');
      toast.error('Failed to add credit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Add New Credit</h2>
            <p className="text-sm text-gray-600 mt-1">Record a credit sale transaction</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Customer Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <User className="h-4 w-4 inline mr-1" />
              Customer Name
            </label>
            <input
              {...register('customer_name', { required: 'Customer name is required' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter customer name"
            />
            {errors.customer_name && (
              <p className="text-red-500 text-sm mt-1">{errors.customer_name.message}</p>
            )}
          </div>

          {/* Product Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Package className="h-4 w-4 inline mr-1" />
              Product/Service
            </label>
            <select
              {...register('product_id', { required: 'Please select a product' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a product...</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - ${product.price}
                </option>
              ))}
            </select>
            {errors.product_id && (
              <p className="text-red-500 text-sm mt-1">{errors.product_id.message}</p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <DollarSign className="h-4 w-4 inline mr-1" />
              Credit Amount
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              {...register('amount', { 
                required: 'Amount is required',
                min: { value: 0.01, message: 'Amount must be greater than 0' },
                valueAsNumber: true
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0.00"
            />
            {errors.amount && (
              <p className="text-red-500 text-sm mt-1">{errors.amount.message}</p>
            )}
            {selectedProduct && (
              <p className="text-sm text-blue-600 mt-1">
                Product price: ${selectedProduct.price}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Due Date
            </label>
            <input
              type="date"
              {...register('due_date', { required: 'Due date is required' })}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {errors.due_date && (
              <p className="text-red-500 text-sm mt-1">{errors.due_date.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              {...register('notes')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Additional notes about this credit..."
            />
          </div>

          {selectedProduct && (
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="font-medium text-blue-900 mb-2">Credit Summary</h3>
              <div className="space-y-1 text-sm text-blue-800">
                <div className="flex justify-between">
                  <span>Product:</span>
                  <span>{selectedProduct.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span>{watch('customer_name') || 'Not specified'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount:</span>
                  <span>${watch('amount') || '0.00'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Due Date:</span>
                  <span>{watch('due_date') || 'Not set'}</span>
                </div>
              </div>
            </div>
          )}

          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="text-sm text-green-800">
              <p className="font-medium mb-1">📊 Dashboard Integration</p>
              <p>This credit will be automatically included in:</p>
              <ul className="list-disc list-inside mt-1 space-y-1 text-xs">
                <li>Credit Panel metrics and totals</li>
                <li>Dashboard credit statistics</li>
                <li>Pending credits tracking</li>
              </ul>
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <CreditCard className="h-4 w-4 inline mr-2" />
              {loading ? 'Adding...' : 'Add Credit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}