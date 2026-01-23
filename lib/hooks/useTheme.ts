"use client";

import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark';

/**
 * Custom hook for theme management with time-based and system preference detection
 *
 * Dark mode activates when:
 * - System time is between 6 PM (18:00) and 6 AM (06:00) local time
 * - OR system prefers dark color scheme
 *
 * @returns Current theme ('light' or 'dark')
 */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const updateTheme = () => {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

      // Check time of day (18:00 - 06:00 = dark mode)
      const now = new Date();
      const hour = now.getHours();
      const isNightTime = hour >= 18 || hour < 6;

      // Use dark theme if it's night time OR system prefers dark
      const shouldUseDark = isNightTime || prefersDark;

      setTheme(shouldUseDark ? 'dark' : 'light');
    };

    // Update theme on mount
    updateTheme();

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => updateTheme();

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleChange);
    }

    // Update theme every minute to catch time transitions
    const interval = setInterval(updateTheme, 60000);

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
      clearInterval(interval);
    };
  }, []);

  return theme;
}
