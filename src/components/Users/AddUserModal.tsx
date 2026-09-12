import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../contexts/AuthContext';
import { clearCache, getSystemUsersStatus, canAddUserWithRole } from '../../lib/supabase';
import { logSecurityEvent } from '../../utils/security';
import toast from 'react-hot-toast';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface UserFormData {
  email: string;
  password: string;
  fullName: string;
  role: 'admin' | 'manager' | 'worker';
}

export default function AddUserModal({ isOpen, onClose, onSuccess }: AddUserModalProps) {
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  
  const { register, handleSubmit, formState: { errors }, reset } = useForm<UserFormData>({
    defaultValues: {
      role: 'worker'
    }
  });

  // Fetch system status when modal opens
  React.useEffect(() => {
    if (isOpen) {
      fetchSystemStatus();
    }
  }, [isOpen]);

  const fetchSystemStatus = async () => {
    try {
      const status = await getSystemUsersStatus();
      setSystemStatus(status);
      setAvailableRoles(status.missing_roles || []);
    } catch (error) {
      console.error('Error fetching system status:', error);
    }
  };

  const onSubmit = async (data: UserFormData) => {
    // Check if we can add this role using available roles
    const canAdd = availableRoles.includes(data.role);
    if (!canAdd) {
      setError(`Cannot add ${data.role}: role already exists or maximum users (3) reached`);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const result = await signUp(data.email, data.password, data.fullName, data.role);
      toast.success('User created successfully!');
      reset();
      logSecurityEvent('user_add_success', { email: '[redacted]', role: data.role });
      onSuccess();
      onClose();
    } catch (error: any) {
      logSecurityEvent('user_add_failure');
      let errorMessage = error.message || 'Failed to create user';
      
      // Provide more user-friendly error messages
      if (errorMessage.includes('User already registered')) {
        errorMessage = 'A user with this email address already exists';
      } else if (errorMessage.includes('Invalid email')) {
        errorMessage = 'Please enter a valid email address';
      } else if (errorMessage.includes('Password')) {
        errorMessage = 'Password must be at least 8 characters with uppercase, lowercase, and numbers';
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    reset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Add New User</h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error Creating User</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              {...register('fullName', { 
                required: 'Full name is required',
                minLength: { value: 2, message: 'Full name must be at least 2 characters' }
              })}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              placeholder="Enter full name"
            />
            {errors.fullName && (
              <p className="text-red-500 text-sm mt-1">{errors.fullName.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              {...register('email', { 
                required: 'Email is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address'
                }
              })}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              placeholder="Enter email address"
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              {...register('role', { required: 'Role is required' })}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            >
              {availableRoles.length > 0 ? (
                availableRoles.map(role => (
                  <option key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </option>
                ))
              ) : (
                <option value="" disabled>No roles available</option>
              )}
            </select>
            {errors.role && (
              <p className="text-red-500 text-sm mt-1">{errors.role.message}</p>
            )}
            {availableRoles.length === 0 && (
              <p className="text-orange-500 text-sm mt-1">
                All roles are filled. Maximum 3 users allowed.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              {...register('password', { 
                required: 'Password is required',
                minLength: {
                  value: 6,
                  message: 'Password must be at least 6 characters'
                }
              })}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              placeholder="Enter password"
            />
            {errors.password && (
              <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
            )}
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || availableRoles.length === 0}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </div>
              ) : (
                'Create User'
              )}
            </button>
          </div>
        </form>

        {/* System Status Information */}
        {systemStatus && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-sm text-blue-700">
              <p className="font-medium mb-1">👥 System Users Status</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>Total Users: {systemStatus.total_users}/3</div>
                <div>Remaining Slots: {systemStatus.remaining_slots}</div>
                <div>Admin: {systemStatus.admin_count ? '✅' : '❌'}</div>
                <div>Manager: {systemStatus.manager_count ? '✅' : '❌'}</div>
                <div>Worker: {systemStatus.worker_count ? '✅' : '❌'}</div>
                <div>Available Roles: {availableRoles.join(', ') || 'None'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Information about the three-user system */}
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-1">🔒 Three User System</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>System supports exactly 3 users: Admin, Manager, Worker</li>
              <li>Each role can only exist once in the system</li>
              <li>Admin can add missing roles until all 3 slots are filled</li>
              <li>Users are automatically verified without email confirmation</li>
            </ul>
          </div>
        </div>

        {/* Debug Information */}
        {loading && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="text-sm text-yellow-700">
              <p className="font-medium mb-1">⏳ Creating User...</p>
              <p className="text-xs">
                This may take a few seconds. Please wait while we create the user account and profile.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}