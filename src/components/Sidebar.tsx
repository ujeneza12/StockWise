import React from 'react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Users, 
  CreditCard,
  Store,
  FileText,
  Mail,
  Shield,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'manager']
  },
  {
    name: 'Stock Management',
    href: '/stock',
    icon: Package,
    roles: ['admin', 'manager', 'worker']
  },
  {
    name: 'Sales Management',
    href: '/sales',
    icon: ShoppingCart,
    roles: ['admin', 'manager', 'worker']
  },
  {
    name: 'Daily Reports',
    href: '/reports',
    icon: FileText,
    roles: ['admin', 'manager', 'worker']
  },
  {
    name: 'User Management',
    href: '/users',
    icon: Users,
    roles: ['admin']
  },
  {
    name: 'Credit Panel',
    href: '/credits',
    icon: CreditCard,
    roles: ['admin', 'manager', 'worker']
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user } = useAuth();

  const filteredNavigation = navigation.filter(item => 
    item.roles.includes(user?.role || 'worker')
  );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-lg border-r border-gray-200 dark:border-gray-700 flex flex-col transform transition-transform duration-300 ease-in-out md:translate-x-0 flex-shrink-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Mobile close button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 md:hidden">
          <div className="flex items-center">
            <Store className="h-8 w-8 text-blue-600" />
            <span className="ml-3 text-xl font-bold text-gray-900 dark:text-white">RGBUSS</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        {/* Desktop header */}
        <div className="hidden md:flex items-center flex-shrink-0 px-6 py-6 border-b border-gray-200 dark:border-gray-700">
          <Store className="h-8 w-8 text-blue-600" />
          <span className="ml-3 text-xl font-bold text-gray-900 dark:text-white">RGBUSS</span>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {filteredNavigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={() => {
                // Close mobile menu when navigation item is clicked
                if (window.innerWidth < 768) {
                  onClose();
                }
              }}
              className={({ isActive }) =>
                `group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-r-2 border-blue-600'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    className={`mr-4 flex-shrink-0 h-5 w-5 transition-colors duration-200 ${
                      isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-300'
                    }`}
                    aria-hidden="true"
                  />
                  {item.name}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex-shrink-0 px-4 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center relative">
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  {user?.full_name?.charAt(0).toUpperCase()}
                </span>
                {user?.role === 'admin' && (
                  <Shield className="h-3 w-3 text-yellow-500 absolute -top-1 -right-1" />
                )}
              </div>
            </div>
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user?.full_name}
              </p>
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                <Mail className="h-3 w-3 mr-1" />
                <span className="truncate">{user?.email}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {user?.role} {user?.role === 'admin' && '👑'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}