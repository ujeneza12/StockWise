import React, { useState } from "react";
import { X, Plus, Minus, Package } from "lucide-react";
import { useForm } from "react-hook-form";
import { supabase, clearCache, Product } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { sanitizeInput, validateInput, logSecurityEvent } from "../../utils/security";
import toast from "react-hot-toast";

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  onSuccess: () => void;
}

interface AdjustmentFormData {
  adjustment_type: "increase" | "decrease";
  quantity: number;
  reason: string;
}

export default function StockAdjustmentModal({
  isOpen,
  onClose,
  product,
  onSuccess,
}: StockAdjustmentModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
    setValue,
  } = useForm<AdjustmentFormData>({
    defaultValues: {
      adjustment_type: "increase",
      quantity: 1,
      reason: "",
    },
  });

  const watchAdjustmentType = watch("adjustment_type");
  const watchQuantity = watch("quantity") || 0;

  const onSubmit = async (data: AdjustmentFormData) => {
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

    // Convert quantity to number to ensure proper calculation
    const adjustmentQuantity = Number(data.quantity);
    const currentQuantity = Number(product.quantity);

    // Validate adjustment
    if (
      data.adjustment_type === "decrease" &&
      adjustmentQuantity > currentQuantity
    ) {
      toast.error("Cannot decrease stock below zero");
      return;
    }

    if (adjustmentQuantity <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }

    // Security: Validate reason is provided
    if (!data.reason?.trim()) {
      toast.error('Reason for adjustment is required');
      return;
    }

    setLoading(true);
    try {
      const previousQuantity = currentQuantity;

      const newQuantity =
        data.adjustment_type === "increase"
          ? previousQuantity + adjustmentQuantity
          : previousQuantity - adjustmentQuantity;

      const { error: updateError } = await supabase
        .from("products")
        .update({
          quantity: newQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq("id", product.id);

      if (updateError) throw updateError;

      const { error: adjustmentError } = await supabase
        .from("stock_adjustments")
        .insert([
          {
            product_id: product.id,
            product_name: product.name,
            adjustment_type: data.adjustment_type,
            quantity_adjusted: adjustmentQuantity,
            previous_quantity: previousQuantity,
            new_quantity: newQuantity,
            reason: sanitizeInput(data.reason.trim(), 200),
            adjusted_by: user.id,
            adjusted_by_name: user.full_name,
          },
        ]);

      if (adjustmentError) throw adjustmentError;

      toast.success(
        `Stock ${
          data.adjustment_type === "increase" ? "increased" : "decreased"
        } successfully! ${previousQuantity} → ${newQuantity}`
      );

      logSecurityEvent('stock_adjustment_success', { 
        product_id: product.id, 
        adjustment_type: data.adjustment_type,
        quantity: adjustmentQuantity 
      });
      
      reset();
      onSuccess();
      onClose();
    } catch (error) {
      logSecurityEvent('stock_adjustment_failure');
      toast.error('Failed to adjust stock. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getNewQuantity = () => {
    const currentQty = Number(product.quantity);
    const adjustQty = Number(watchQuantity) || 0;

    if (watchAdjustmentType === "increase") {
      return currentQty + adjustQty;
    } else {
      return Math.max(0, currentQty - adjustQty);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-md mx-auto my-8 shadow-2xl">
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white rounded-t-xl sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Adjust Stock</h2>
            <p className="text-sm text-gray-600 truncate max-w-xs">
              {product.name}
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
        <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Current Stock Info */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Package className="h-5 w-5 text-blue-600" />
                  <span className="font-medium text-gray-900">
                    Current Stock:
                  </span>
                </div>
                <span className="text-2xl font-bold text-blue-600">
                  {product.quantity}
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Adjustment Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Adjustment Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setValue("adjustment_type", "increase")}
                    className={`flex items-center justify-center px-4 py-3 rounded-lg border-2 transition-colors ${
                      watchAdjustmentType === "increase"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-gray-300 text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Increase
                  </button>
                  <button
                    type="button"
                    onClick={() => setValue("adjustment_type", "decrease")}
                    className={`flex items-center justify-center px-4 py-3 rounded-lg border-2 transition-colors ${
                      watchAdjustmentType === "decrease"
                        ? "border-red-500 bg-red-50 text-red-700"
                        : "border-gray-300 text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    <Minus className="h-4 w-4 mr-2" />
                    Decrease
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity to {watchAdjustmentType}
                </label>
                <input
                  type="number"
                  min="1"
                  max={
                    watchAdjustmentType === "decrease"
                      ? product.quantity
                      : undefined
                  }
                  {...register("quantity", {
                    required: "Quantity is required",
                    min: { value: 1, message: "Quantity must be at least 1" },
                    max:
                      watchAdjustmentType === "decrease"
                        ? {
                            value: product.quantity,
                            message: "Cannot decrease more than current stock",
                          }
                        : undefined,
                    valueAsNumber: true, // This ensures the value is treated as a number
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter quantity"
                />
                {errors.quantity && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.quantity.message}
                  </p>
                )}
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Adjustment
                </label>
                <select
                  {...register("reason", { required: "Reason is required" })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select reason...</option>
                  <option value="New stock received">New stock received</option>
                  <option value="Inventory correction">
                    Inventory correction
                  </option>
                  <option value="Damaged goods">Damaged goods</option>
                  <option value="Expired products">Expired products</option>
                  <option value="Theft/Loss">Theft/Loss</option>
                  <option value="Return to supplier">Return to supplier</option>
                  <option value="Manual count adjustment">
                    Manual count adjustment
                  </option>
                  <option value="Other">Other</option>
                </select>
                {errors.reason && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.reason.message}
                  </p>
                )}
              </div>

              {/* Preview */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="font-medium text-blue-900 mb-3">
                  Adjustment Preview
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Current Stock:</span>
                    <span className="font-medium">{product.quantity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      {watchAdjustmentType === "increase"
                        ? "Adding:"
                        : "Removing:"}
                    </span>
                    <span
                      className={`font-medium ${
                        watchAdjustmentType === "increase"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {watchAdjustmentType === "increase" ? "+" : "-"}
                      {watchQuantity}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-gray-600">Calculation:</span>
                    <span className="text-xs text-gray-600">
                      {product.quantity}{" "}
                      {watchAdjustmentType === "increase" ? "+" : "-"}{" "}
                      {watchQuantity} = {getNewQuantity()}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-medium">New Stock:</span>
                    <span className="font-bold text-blue-600">
                      {getNewQuantity()}
                    </span>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl sticky bottom-0">
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
              className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${
                watchAdjustmentType === "increase"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {loading
                ? "Processing..."
                : `${
                    watchAdjustmentType === "increase" ? "Increase" : "Decrease"
                  } Stock`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}