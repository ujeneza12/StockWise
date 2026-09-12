import React, { useState, useEffect } from 'react';
import { Trash2, Calendar, Database, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { runManualCleanup, getCleanupLogs } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface CleanupLog {
  id: string;
  cleanup_type: string;
  records_deleted: number;
  cleanup_date: string;
  details: any;
  created_at: string;
}

export default function CleanupPanel() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<CleanupLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchCleanupLogs();
    }
  }, [user]);

  const fetchCleanupLogs = async () => {
    try {
      const logs = await getCleanupLogs(20);
      setLogs(logs);
    } catch (error) {
      toast.error('Error loading cleanup logs');
    } finally {
      setLoading(false);
    }
  };

  const handleManualCleanup = async () => {
    if (!user || user.role !== 'admin') {
      toast.error('Only administrators can run manual cleanup');
      return;
    }

    setRunning(true);
    try {
      const result = await runManualCleanup();
      
      toast.success(
        `Cleanup completed! Deleted ${result.credits_deleted} old credits and ${result.reports_deleted} old reports.`
      );
      
      await fetchCleanupLogs();
    } catch (error) {
      toast.error('Error running cleanup');
    } finally {
      setRunning(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
        <p className="text-gray-600">Only administrators can access the cleanup panel.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Database Cleanup</h2>
          <p className="text-gray-600">Manage automated cleanup of old records</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={fetchCleanupLogs}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleManualCleanup}
            disabled={running}
            className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <Trash2 className={`h-4 w-4 mr-2 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Running...' : 'Run Manual Cleanup'}
          </button>
        </div>
      </div>

      {/* Cleanup Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <Calendar className="h-5 w-5 text-blue-400 mr-2" />
            <h3 className="text-sm font-medium text-blue-800">Paid Credits Cleanup</h3>
          </div>
          <p className="text-sm text-blue-700 mt-2">
            Automatically deletes paid credits that are older than 3 months.
            This helps keep the database clean while preserving recent transaction history.
          </p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <Database className="h-5 w-5 text-green-400 mr-2" />
            <h3 className="text-sm font-medium text-green-800">Daily Reports Cleanup</h3>
          </div>
          <p className="text-sm text-green-700 mt-2">
            Automatically deletes daily reports that are older than 5 months.
            Recent reports are preserved for business analysis and compliance.
          </p>
        </div>
      </div>

      {/* Schedule Info */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-yellow-400 mr-2" />
          <h3 className="text-sm font-medium text-yellow-800">Automated Schedule</h3>
        </div>
        <p className="text-sm text-yellow-700 mt-2">
          Cleanup runs automatically every Sunday at 2:00 AM. You can also run manual cleanup anytime using the button above.
        </p>
      </div>

      {/* Cleanup Logs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Cleanup History</h3>
          <p className="text-sm text-gray-600">Recent cleanup operations and their results</p>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Trash2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p>No cleanup operations recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Records Deleted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(log.cleanup_date), 'MMM dd, yyyy HH:mm')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        log.cleanup_type === 'paid_credits' 
                          ? 'bg-blue-100 text-blue-800'
                          : log.cleanup_type === 'daily_reports'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {log.cleanup_type === 'paid_credits' && 'Paid Credits'}
                        {log.cleanup_type === 'daily_reports' && 'Daily Reports'}
                        {log.cleanup_type === 'weekly_cleanup_summary' && 'Weekly Summary'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex items-center">
                        {log.records_deleted > 0 ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-gray-400 mr-1" />
                        )}
                        {log.records_deleted}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                      {log.details?.cutoff_date && (
                        <span>Cutoff: {log.details.cutoff_date}</span>
                      )}
                      {log.details?.total_deleted && (
                        <span>Total: {log.details.total_deleted}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}