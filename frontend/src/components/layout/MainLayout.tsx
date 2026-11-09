import { useState, ReactNode } from 'react';
import DynamicSidebar from './DynamicSidebar';
import Header from './Header';
import DocumentPreviewHost from '../common/DocumentPreviewHost';
import OfflineStatus from '../OfflineStatus';

export default function MainLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen flex bg-gray-100">
      <DynamicSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={`flex-1 flex flex-col transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
        <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <OfflineStatus />
        <main className="flex-1 p-5 overflow-auto">
          {children}
        </main>
        <DocumentPreviewHost />
      </div>
    </div>
  );
}
