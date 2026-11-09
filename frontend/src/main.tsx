import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { InstitutionProvider } from './contexts/InstitutionContext';
import { LicenseProvider } from './contexts/LicenseContext';
import { BrandProvider } from './contexts/BrandContext';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      refetchInterval: 15000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <InstitutionProvider>
          <LicenseProvider>
            <AuthProvider>
              <BrandProvider>
                <App />
                <Toaster position="top-right" />
              </BrandProvider>
            </AuthProvider>
          </LicenseProvider>
        </InstitutionProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
