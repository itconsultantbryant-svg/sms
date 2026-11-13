import { useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import DynamicSidebar from './DynamicSidebar';
import Header from './Header';
import DocumentPreviewHost from '../common/DocumentPreviewHost';
import OfflineStatus from '../OfflineStatus';

export default function MainLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const { pathname } = useLocation();
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const changed = () => setSidebarOpen(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    if (!window.matchMedia('(min-width: 1024px)').matches) setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen flex bg-gray-100">
      {sidebarOpen && <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <DynamicSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={`min-w-0 flex-1 flex flex-col transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'ml-0'}`}>
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <OfflineStatus />
        <main className="min-w-0 flex-1 p-4 sm:p-5 overflow-auto">
          {children}
        </main>
        <DocumentPreviewHost />
      </div>
    </div>
  );
}
