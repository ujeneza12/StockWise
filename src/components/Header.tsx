import React from 'react';
import { Bell, LogOut, Mail, Clock, Shield, Menu } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { clearCache } from '../lib/supabase';
import ThemeToggle from './ThemeToggle';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user, signOut, sessionTimeRemaining, extendSession, loading } = useAuth();

  const formatTimeRemaining = (milliseconds: number) => {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor((milliseconds % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const showSessionTimer = sessionTimeRemaining < 5 * 60 * 1000;
  
  const handleSignOut = async () => {
    try {
      // Security: Clear all possible auth data before sign out
      clearCache();
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear any Supabase auth tokens
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('auth') || key.includes('session'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

      await signOut();
      
      // Security: Force complete page reload and redirect
      window.location.replace('/login?logout=true');
    } catch (error) {
      console.error('Sign out error:', error);
      // Security: Force logout even if there's an error
      localStorage.clear();
      sessionStorage.clear();
      
      // Force redirect even on error
      window.location.replace('/login?logout=true&force=true');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 flex-shrink-0 sticky top-0 z-30 w-full">
      <div className="w-full px-2 sm:px-4 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16 lg:h-18">
          <div className="flex items-center">
            {/* Mobile menu button */}
            <button
              onClick={onMenuClick}
              className="md:hidden p-1.5 mr-1 sm:p-2 sm:mr-2 rounded-lg text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
            
            <h1 className="text-sm sm:text-lg lg:text-xl xl:text-2xl font-semibold text-gray-900 dark:text-white truncate max-w-32 sm:max-w-none">
              Business Management System
            </h1>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-2 lg:space-x-4 flex-shrink-0">
            {user && showSessionTimer && sessionTimeRemaining > 0 && (
              <div className="hidden md:flex items-center space-x-1 lg:space-x-2">
                <Shield className="h-3 w-3 lg:h-4 lg:w-4 text-orange-500" />
                <div className={`flex items-center px-2 py-1 lg:px-3 rounded-full text-xs lg:text-sm ${
                  sessionTimeRemaining < 2 * 60 * 1000 
                    ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200' 
                    : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                }`}>
                  <Clock className="h-3 w-3 lg:h-4 lg:w-4 mr-1" />
                  <span>{formatTimeRemaining(sessionTimeRemaining)}</span>
                </div>
                <button
                  onClick={extendSession}
                  className="px-2 py-1 lg:px-3 bg-blue-600 dark:bg-blue-500 text-white rounded text-xs lg:text-sm hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                >
                  Extend
                </button>
              </div>
            )}

            {/* Mobile Session Timer - Compact Version */}
            {user && showSessionTimer && sessionTimeRemaining > 0 && (
              <div className="md:hidden flex items-center">
                <div className={`flex items-center px-1.5 py-0.5 rounded text-xs ${
                  sessionTimeRemaining < 2 * 60 * 1000 
                    ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200' 
                    : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                }`}>
                  <Clock className="h-3 w-3 mr-0.5" />
                  <span>{formatTimeRemaining(sessionTimeRemaining)}</span>
                </div>
              </div>
            )}

            <ThemeToggle />

            {/* User Profile Section */}
            <div className="flex items-center space-x-1 sm:space-x-2">
              {/* Avatar */}
              <div className="h-7 w-7 sm:h-8 sm:w-8 lg:h-10 lg:w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                <span className="text-xs sm:text-sm lg:text-base font-medium text-blue-800 dark:text-blue-200">
                  {user?.full_name?.charAt(0).toUpperCase()}
                </span>
              </div>
              
              {/* User Info - Responsive visibility */}
              <div className="hidden sm:block min-w-0 flex-1">
                <div className="text-xs sm:text-sm lg:text-base font-medium text-gray-900 dark:text-white truncate">
                  {user?.full_name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  <Mail className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1 flex-shrink-0" />
                  <span className="truncate max-w-20 sm:max-w-32 lg:max-w-none">{user?.email}</span>
                </div>
              </div>
            </div>

            {/* Sign Out Button */}
            <div className="flex items-center">
              <button
                onClick={handleSignOut}
                disabled={loading}
                className="p-1.5 sm:p-2 lg:p-3 text-gray-400 dark:text-gray-300 hover:text-gray-500 dark:hover:text-gray-200 transition-colors disabled:opacity-50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center"
                title="Sign out"
              >
                <LogOut className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}