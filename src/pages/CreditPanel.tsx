import React, { useState, useEffect } from 'react';
import { CreditCard, Search, AlertTriangle, CheckCircle, Plus, DollarSign } from 'lucide-react';
import { getCredits, clearCache, supabase, Credit } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import AddCreditModal from '../components/Credits/AddCreditModal';

export default function CreditPanel() {
  const { user } = useAuth();
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'overdue'>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  const canMarkAsPaid = user?.role === 'admin' || user?.role === 'manager';
  const canAddCredits = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'worker';

  useEffect(() => {
    fetchCredits();
  }, [user]);

  const fetchCredits = async () => {
    try {
      const credits = await getCredits(user?.role === 'worker' ? user.id : undefined);

      const today = new Date().toISOString().split('T')[0];
      const updatedCredits = credits.map(credit => ({
        ...credit,
        status: credit.status === 'pending' && credit.due_date < today ? 'overdue' : credit.status
      }));

      setCredits(updatedCredits);
    } catch (error) {
      toast.error('Error loading credits');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async (creditId: string) => {
    if (!canMarkAsPaid) {
      toast.error('You do not have permission to mark credits as paid');
      return;
    }

    try {
      const { error } = await supabase
        .from('credits')
        .update({ status: 'paid' })
        .eq('id', creditId);

      if (error) throw error;

      toast.success('Credit marked as paid');
      // Clear cache to ensure fresh data
      clearCache();
      fetchCredits();
    } catch (error) {
      toast.error('Error updating credit status');
    }
  };

  const filteredCredits = credits.filter(credit => {
    const matchesSearch = credit.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         credit.product_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || credit.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const totalPending = credits.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0);
  const totalOverdue = credits.filter(c => c.status === 'overdue').reduce((sum, c) => sum + c.amount, 0);
  const totalPaid = credits.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.amount, 0);
  const totalCash = totalPaid;
  const pendingCount = credits.filter(c => c.status === 'pending').length;
  const overdueCount = credits.filter(c => c.status === 'overdue').length;
  const paidCount = credits.filter(c => c.status === 'paid').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-8 w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-2xl lg:text-3xl xl:text-4xl font-bold text-gray-900">Credit Panel</h1>
          <p className="text-gray-600 lg:text-lg">
            Monitor and manage credit sales
            {user?.role === 'worker' && (
              <span className="text-orange-600 ml-2">(View Only - Contact manager to mark payments)</span>
            )}
          </p>
          <div className="flex items-center space-x-4 mt-2 lg:mt-3">
            <p className="text-sm lg:text-base text-green-600">
              📊 Credit metrics are synced with Dashboard
            </p>
          </div>
        </div>
        
        {/* Add Credit Button */}
        {canAddCredits && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center px-4 py-2 lg:px-6 lg:py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Credit
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Credits</p>
              <p className="text-2xl lg:text-3xl font-bold text-orange-600">${totalPending.toFixed(2)}</p>
              <p className="text-xs text-orange-500 mt-1">{pendingCount} credits</p>
            </div>
            <div className="p-3 lg:p-4 bg-orange-100 rounded-lg">
              <CreditCard className="h-6 w-6 lg:h-8 lg:w-8 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Overdue Credits</p>
              <p className="text-2xl font-bold text-red-600">${totalOverdue.toFixed(2)}</p>
              <p className="text-xs text-red-500 mt-1">{overdueCount} credits</p>
            </div>
            <div className="p-3 bg-red-100 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Cash (Paid)</p>
              <p className="text-2xl font-bold text-green-600">${totalCash.toFixed(2)}</p>
              <p className="text-xs text-green-500 mt-1">{paidCount} credits</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Credits</p>
              <p className="text-2xl font-bold text-blue-600">{credits.length}</p>
              <p className="text-xs text-blue-500 mt-1">All time</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Permission Notice for Workers */}
      {user?.role === 'worker' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-blue-400 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                Limited Access
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>
                  As a worker, you can view and add credit sales but cannot mark them as paid. 
                  Please contact your manager or administrator to process payments.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by customer or product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'paid' | 'overdue')}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>

      {/* Credits Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Credit Sales ({filteredCredits.length})
          </h2>
        </div>

        {filteredCredits.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p>No credits found matching your criteria</p>
            {canAddCredits && (
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add First Credit
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Due Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCredits.map((credit) => (
                  <tr key={credit.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {credit.customer_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {credit.product_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      ${credit.amount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {format(new Date(credit.due_date), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        credit.status === 'paid' 
                          ? 'bg-green-100 text-green-800'
                          : credit.status === 'overdue'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}>
                        {credit.status === 'paid' && <CheckCircle className="h-3 w-3 mr-1" />}
                        {credit.status === 'overdue' && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {credit.status.charAt(0).toUpperCase() + credit.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {format(new Date(credit.created_at), 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(credit.status === 'pending' || credit.status === 'overdue') && canMarkAsPaid ? (
                        <button
                          onClick={() => handleMarkAsPaid(credit.id)}
                          className="text-green-600 hover:text-green-900 text-sm font-medium transition-colors"
                        >
                          Mark as Paid
                        </button>
                      ) : (credit.status === 'pending' || credit.status === 'overdue') && !canMarkAsPaid ? (
                        <span className="text-gray-400 text-sm" title="Contact manager to mark as paid">
                          Manager Only
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Credit Modal */}
      {showAddModal && (
        <AddCreditModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchCredits();
          }}
        />
      )}
    </div>
  );
}