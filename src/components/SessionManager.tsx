import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';

export default function SessionManager() {
  const { user, sessionTimeRemaining, extendSession, loading, sessionChecked } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-extend session on user activity
    const handleUserActivity = () => {
      if (user && sessionTimeRemaining > 0 && sessionTimeRemaining < 30 * 60 * 1000) { // Less than 30 minutes
        extendSession();
      }
    };

    // Listen for user activity events
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, handleUserActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserActivity);
      });
    };
  }, [user, sessionTimeRemaining, extendSession]);

  useEffect(() => {
    // Redirect to appropriate page based on user state and current location
    if (sessionChecked && !loading && user) {
      const authPages = ['/login', '/register'];
      if (authPages.includes(location.pathname)) {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, location.pathname, navigate, sessionChecked, loading]);

  return null; // This component doesn't render anything
}