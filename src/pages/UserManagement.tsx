import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Shield, Mail } from 'lucide-react';
import { getUsers, clearCache, supabase, getSystemUsersStatus, User } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import AddUserModal from '../components/Users/AddUserModal';
import CleanupPanel from '../components/Admin/CleanupPanel';

const UserManagement = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'cleanup'>('users');

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchUsers();
      fetchSystemStatus();
    }
  }, [currentUser]);

  const fetchUsers = async () => {
    try {
      const users = await getUsers();
      setUsers(users);
    } catch (error) {
      toast.error('Error loading users');
    } finally {
      setLoading(false);
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const status = await getSystemUsersStatus();
      setSystemStatus(status);
    } catch (error) {
      console.error('Error loading system status:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUser?.id) {
      toast.error('You cannot delete your own account');
      return;
    }

    if (!confirm('Are you sure you want to delete this user? This will free up their role slot for a new user.')) {
      return;
    }

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (profileError) throw profileError;

      toast.success('User deleted successfully');
      clearCache('users');
      fetchUsers();
      fetchSystemStatus();
    } catch (error) {
      toast.error('Error deleting user');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    // Check if the new role already exists (unless it's the same user)
    const roleExists = users.some(u => u.role === newRole && u.id !== userId);
    if (roleExists) {
      toast.error(`Role ${newRole} already exists. Each role can only be assigned to one user.`);
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      toast.success('User role updated successfully');
      clearCache('users');
      fetchUsers();
      fetchSystemStatus();
    } catch (error) {
      toast.error('Error updating user role');
    }
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div className="text-center py-12 dark:bg-gray-900 min-h-screen flex items-center justify-center">
        <div>
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Access Denied</h3>
          <p className="text-gray-600 dark:text-gray-400">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 dark:bg-gray-900 min-h-screen w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col space-y-4">
        <div>
          <h1 className="text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900 dark:text-white">Administration</h1>
          <p className="text-gray-600 dark:text-gray-400 lg:text-lg">Manage users, permissions, and system maintenance</p>
          <p className="text-sm lg:text-base text-blue-600 dark:text-blue-400 mt-1">
            📧 Users authenticate with email addresses and passwords
          </p>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'users'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => setActiveTab('cleanup')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'cleanup'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Database Cleanup
          </button>
        </div>
        
        {/* Add User Button - only show on users tab */}
        {activeTab === 'users' && (
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddModal(true)}
              disabled={systemStatus?.remaining_slots === 0}
              className="inline-flex items-center px-4 py-2 lg:px-6 lg:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              {systemStatus?.remaining_slots === 0 ? 'All Roles Filled' : 'Add User'}
            </button>
          </div>
        )}
      </div>

      {/* System Status Panel */}
      {activeTab === 'users' && systemStatus && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">System Status</h3>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {systemStatus.total_users}/3 Users
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-lg border-2 ${
              systemStatus.admin_count > 0 
                ? 'border-green-200 bg-green-50 dark:bg-green-900/20' 
                : 'border-red-200 bg-red-50 dark:bg-red-900/20'
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900 dark:text-white">Admin</span>
                <span className={`text-2xl ${
                  systemStatus.admin_count > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {systemStatus.admin_count > 0 ? '✅' : '❌'}
                </span>
              </div>
            </div>
            
            <div className={`p-4 rounded-lg border-2 ${
              systemStatus.manager_count > 0 
                ? 'border-green-200 bg-green-50 dark:bg-green-900/20' 
                : 'border-red-200 bg-red-50 dark:bg-red-900/20'
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900 dark:text-white">Manager</span>
                <span className={`text-2xl ${
                  systemStatus.manager_count > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {systemStatus.manager_count > 0 ? '✅' : '❌'}
                </span>
              </div>
            </div>
            
            <div className={`p-4 rounded-lg border-2 ${
              systemStatus.worker_count > 0 
                ? 'border-green-200 bg-green-50 dark:bg-green-900/20' 
                : 'border-red-200 bg-red-50 dark:bg-red-900/20'
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900 dark:text-white">Worker</span>
                <span className={`text-2xl ${
                  systemStatus.worker_count > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {systemStatus.worker_count > 0 ? '✅' : '❌'}
                </span>
              </div>
            </div>
          </div>
          
          {systemStatus.missing_roles && systemStatus.missing_roles.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Missing Roles:</strong> {systemStatus.missing_roles.join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'users' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <Users className="h-5 w-5 text-blue-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">All Users ({users.length})</h2>
          </div>
        </div>

        {users.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No users found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Email Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Created At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                            {user.full_name?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{user.full_name}</div>
                          {user.id === currentUser?.id && (
                            <div className="text-xs text-blue-600 dark:text-blue-400">(You)</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                        <Mail className="h-4 w-4 mr-2 text-gray-400 dark:text-gray-500" />
                        {user.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={user.id === currentUser?.id}
                        className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="worker">Worker</option>
                      </select>
                      {user.id === currentUser?.id && (
                        <p className="text-xs text-gray-500 mt-1">Cannot change own role</p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={user.id === currentUser?.id}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 disabled:text-gray-400 dark:disabled:text-gray-600 disabled:cursor-not-allowed"
                        title={user.id === currentUser?.id ? "Cannot delete your own account" : "Delete user"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
      
      {activeTab === 'cleanup' && (
        <CleanupPanel />
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <AddUserModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchUsers();
            fetchSystemStatus();
          }}
        />
      )}

      {/* Information Panel - Updated for three-user system */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <div className="flex">
          <Shield className="h-5 w-5 text-green-400 dark:text-green-300 mt-0.5" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Three User System
            </h3>
            <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
              <ul className="list-disc list-inside space-y-1">
                <li>System supports exactly 3 users: one Admin, one Manager, one Worker</li>
                <li>Each role can only exist once - no duplicate roles allowed</li>
                <li>Admin can add missing roles until all 3 slots are filled</li>
                <li>Deleting a user frees up their role slot for reassignment</li>
                <li>Users are automatically verified without email confirmation</li>
                <li>Role-based permissions are enforced throughout the system</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;