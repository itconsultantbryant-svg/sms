import { useEffect, useState } from 'react';
import { Menu, LogOut, User, Search, Maximize2, Grid3x3, Globe, Bell, MessageSquare, ExternalLink } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useBrand } from '../../contexts/BrandContext';
import InstitutionSelector from './InstitutionSelector';
import DemoModeIndicator from '../DemoModeIndicator';
import api from '../../utils/api';

interface HeaderProps {
  onToggleSidebar: () => void;
}

function normalizeWebsite(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { user, logout } = useAuth();
  const { branding } = useBrand();
  const queryClient = useQueryClient();
  const websiteUrl = normalizeWebsite(branding?.website || (user as any)?.institution_website);
  const [openInbox, setOpenInbox] = useState(false);

  const { data: inbox } = useQuery({
    queryKey: ['notifications-inbox'],
    queryFn: () => api.get('/notifications/inbox').then((r) => r.data),
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
    enabled: !!user,
  });

  useEffect(() => {
    const onClick = () => setOpenInbox(false);
    if (openInbox) window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [openInbox]);

  const acknowledge = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/acknowledge`);
      toast.success('Acknowledged');
      queryClient.invalidateQueries({ queryKey: ['notifications-inbox'] });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not acknowledge');
    }
  };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button aria-label="Toggle navigation" onClick={onToggleSidebar} className="text-gray-500 hover:text-gray-700">
          <Menu size={20} />
        </button>
        <button className="text-gray-400 hover:text-gray-600 hidden sm:block">
          <Maximize2 size={18} />
        </button>
        <button className="text-gray-400 hover:text-gray-600 hidden sm:block">
          <Grid3x3 size={18} />
        </button>

        {branding?.institution_name && user?.user_type !== 'platform_admin' && (
          <div className="hidden md:flex items-center gap-2 ml-1">
            {branding.logo && (
              <img src={branding.logo} alt="" className="h-7 w-7 rounded object-contain" />
            )}
            <span className="text-sm font-semibold text-gray-800 truncate max-w-[200px]">
              {branding.institution_name}
            </span>
          </div>
        )}

        <div className="relative hidden lg:block">
          <input
            type="text"
            placeholder="Search"
            className="w-48 xl:w-64 pl-3 pr-8 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
          />
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {user?.user_type === 'platform_admin' && (
          <>
            <InstitutionSelector />
            <div className="h-6 w-px bg-gray-200"></div>
          </>
        )}

        {user?.user_type !== 'platform_admin' && <DemoModeIndicator />}
        <div className="h-6 w-px bg-gray-200"></div>

        {websiteUrl ? (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-[var(--brand-primary)] relative"
            title="School website"
          >
            <Globe size={18} />
            <ExternalLink size={10} className="absolute -top-1 -right-1 opacity-70" />
          </a>
        ) : (
          <span className="text-gray-300" title="No school website set">
            <Globe size={18} />
          </span>
        )}
        <button
          type="button"
          className="text-gray-400 hover:text-gray-600 relative"
          onClick={(e) => { e.stopPropagation(); setOpenInbox((value) => !value); }}
          title="Messages and announcements"
        >
          <MessageSquare size={18} />
          {inbox?.unread ? <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" /> : null}
        </button>
        <button
          type="button"
          className="text-gray-400 hover:text-gray-600 relative"
          onClick={(e) => { e.stopPropagation(); setOpenInbox((value) => !value); }}
          title="Notifications"
        >
          <Bell size={18} />
          {inbox?.unread ? (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center">
              {inbox.unread > 9 ? '9+' : inbox.unread}
            </span>
          ) : null}
        </button>

        {openInbox && (
          <div
            className="absolute right-4 top-14 w-96 max-w-[95vw] bg-white border border-gray-200 rounded-lg shadow-xl z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Inbox</h3>
              <span className="text-xs text-gray-500">{inbox?.unread || 0} pending</span>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y">
              {(inbox?.announcements || []).map((item: any) => (
                <div key={`a-${item.id}`} className="p-3 text-sm">
                  <p className="font-medium text-gray-900">{item.title}</p>
                  <p className="text-gray-600 mt-1 line-clamp-3">{item.content}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-400 capitalize">{item.type} announcement</span>
                    {item.acknowledged ? (
                      <span className="text-xs text-green-600">Acknowledged</span>
                    ) : (
                      <button type="button" className="text-xs text-primary-600" onClick={() => acknowledge(item.id)}>Acknowledge</button>
                    )}
                  </div>
                </div>
              ))}
              {(inbox?.notifications || []).map((item: any) => (
                <div key={`n-${item.id}`} className="p-3 text-sm">
                  <p className="font-medium text-gray-900">{item.title}</p>
                  <p className="text-gray-600 mt-1 line-clamp-3">{item.message}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-400">{item.created_at}</span>
                    {item.acknowledged || item.is_acknowledged ? (
                      <span className="text-xs text-green-600">Acknowledged</span>
                    ) : (
                      <button type="button" className="text-xs text-primary-600" onClick={() => acknowledge(item.id)}>Acknowledge</button>
                    )}
                  </div>
                </div>
              ))}
              {!inbox?.announcements?.length && !inbox?.notifications?.length && (
                <p className="p-6 text-center text-gray-400 text-sm">No messages yet</p>
              )}
            </div>
          </div>
        )}

        <div className="h-6 w-px bg-gray-200"></div>

        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
            style={{ backgroundColor: 'rgba(var(--brand-primary-rgb), 0.12)' }}
          >
            <User size={16} style={{ color: 'var(--brand-primary)' }} />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-medium text-gray-800 leading-tight">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-[10px] text-gray-400 capitalize">
              {user?.role?.name || user?.user_type?.replace('_', ' ')}
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          className="text-gray-400 hover:text-red-500 transition-colors"
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
