import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  LogOut,
  Sun,
  Moon,
  X,
  List,
  Image as ImageIcon,
  Users,
  MessageSquare,
  Tag,
  Globe,
  BarChart3,
  Activity,
  Settings,
  ChevronsUpDown,
  AlertTriangle,
  Trophy,
  ScrollText,
  FileText as FileTextIcon,
  CalendarDays,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

const sections = [
  {
    label: 'Overview',
    icon: LayoutDashboard,
    groups: [
      {
        items: [
          { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
          { icon: BarChart3, label: 'Analytics', path: '/analytics' },
          { icon: Activity, label: 'Activity Log', path: '/activity' },
        ],
      },
    ],
  },
  {
    label: 'Publishing',
    icon: FileText,
    groups: [
      {
        items: [
          { icon: FileText, label: 'Editorial Queue', path: '/editorial', badgeKey: 'pending' },
          { icon: List, label: 'Submissions', path: '/posts' },
          { icon: Globe, label: 'Live Posts', path: '/published' },
        ],
      },
    ],
  },
  {
    label: 'Management',
    icon: Trophy,
    groups: [
      {
        heading: 'Contests',
        items: [
          { icon: Trophy, label: 'Contests', path: '/contests', end: true },
          { icon: FileTextIcon, label: 'Contest Guides', path: '/contests/details' },
          { icon: AlertTriangle, label: 'Contest Image Health', path: '/contests/images' },
          { icon: Trophy, label: 'Contest Categories', path: '/contest-categories' },
        ],
      },
      {
        heading: 'Events',
        items: [
          { icon: CalendarDays, label: 'Events', path: '/events' },
          { icon: AlertTriangle, label: 'Review Queue', path: '/events/review-queue' },
          { icon: CalendarDays, label: 'Event Types', path: '/event-types' },
        ],
      },
      {
        heading: 'People & Content',
        items: [
          { icon: Tag, label: 'Post Categories', path: '/categories' },
          { icon: Users, label: 'User Management', path: '/users' },
          { icon: ImageIcon, label: 'Media Library', path: '/images' },
          { icon: MessageSquare, label: 'Comments', path: '/comments' },
        ],
      },
    ],
  },
  {
    label: 'Pipeline',
    icon: ScrollText,
    groups: [
      {
        items: [
          { icon: ScrollText, label: 'Prompts', path: '/prompts' },
        ],
      },
    ],
  },
];

const RAIL_WIDTH = 60; // px — matches the w-[60px] rail class
const FLYOUT_WIDTH = 208; // px — flyout panel width
const HOVER_OPEN_DELAY = 40;
const HOVER_CLOSE_DELAY = 180;

const isPathInSection = (pathname, itemPath) =>
  pathname === itemPath || pathname.startsWith(`${itemPath}/`);

const STORAGE_KEY = 'sidebar_expanded_sections';

const itemClasses = (isActive) => `
  flex items-center gap-2.5 px-2 py-[5px] rounded-[5px] text-[13px] transition-colors group outline-none
  ${isActive
    ? 'bg-neutral-200/70 dark:bg-white/[0.06] font-medium text-neutral-900 dark:text-neutral-100'
    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/40 dark:hover:bg-white/[0.03] hover:text-neutral-900 dark:hover:text-neutral-200'
  }
`;

const itemIconClasses = (isActive) => `shrink-0 transition-colors ${
  isActive
    ? 'text-neutral-900 dark:text-neutral-200'
    : 'text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300'
}`;

const PendingBadge = ({ count }) =>
  count > 0 ? (
    <span className="ml-auto px-[5px] py-[1.5px] rounded bg-neutral-200 dark:bg-white/10 text-[10px] font-semibold text-neutral-650 dark:text-neutral-400 leading-none">
      {count > 99 ? '99+' : count}
    </span>
  ) : null;

/* ------------------------------------------------------------------ */
/* Hover flyout for rail mode                                          */
/* ------------------------------------------------------------------ */

const Flyout = ({ section, anchorTop, pendingCount, onClose }) => {
  const panelRef = useRef(null);
  const [top, setTop] = useState(anchorTop);

  // Clamp the panel into the viewport after it renders at its natural height
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    const maxTop = window.innerHeight - h - 8;
    setTop(Math.max(8, Math.min(anchorTop, maxTop)));
  }, [anchorTop]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    const close = () => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true); // capture: any scroll closes
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={`${section.label} submenu`}
      style={{ top, left: RAIL_WIDTH + 8 }}
      className="fixed z-[60] w-[208px] p-1.5 rounded-lg border border-neutral-200/70 dark:border-white/[0.06] bg-white dark:bg-[#1a1a1c] shadow-lg shadow-neutral-900/10 dark:shadow-black/40"
    >
      <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold tracking-[0.04em] text-neutral-400 dark:text-neutral-500 uppercase">
        {section.label}
      </div>
      {section.groups.map((group) => (
        <div key={group.heading || 'default'} className="flex flex-col gap-0.5 mb-0.5">
          {group.heading && (
            <span className="px-2 pb-0.5 text-[10px] font-medium tracking-[0.04em] text-neutral-400 dark:text-neutral-500 uppercase">
              {group.heading}
            </span>
          )}
          {group.items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) => itemClasses(isActive)}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={16} strokeWidth={1.5} className={itemIconClasses(isActive)} />
                  <span className="truncate">{item.label}</span>
                  {item.badgeKey && <PendingBadge count={pendingCount} />}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Expanded section (accordion, unchanged behavior)                    */
/* ------------------------------------------------------------------ */

const SectionBlock = ({ section, isOpen, onToggle, pendingCount, onClose }) => {
  const sectionBadge =
    pendingCount > 0 && section.groups.some((g) => g.items.some((i) => i.badgeKey))
      ? pendingCount
      : 0;

  const bodyId = `nav-section-${section.label.toLowerCase().replace(/[^a-z]+/g, '-')}`;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        className="w-full flex items-center gap-2 px-2 py-1 rounded-[5px] text-[11px] font-semibold tracking-[0.02em] text-neutral-500 dark:text-neutral-400 uppercase hover:bg-neutral-200/40 dark:hover:bg-white/[0.03] hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500 cursor-pointer"
      >
        <span className="flex-1 text-left">{section.label}</span>

        {!isOpen && sectionBadge > 0 && (
          <span className="px-[5px] py-[1.5px] rounded bg-neutral-200 dark:bg-white/10 text-[10px] font-semibold text-neutral-650 dark:text-neutral-300 leading-none">
            {sectionBadge > 99 ? '99+' : sectionBadge}
          </span>
        )}

        <ChevronDown
          size={13}
          strokeWidth={2}
          className={`shrink-0 text-neutral-400 dark:text-neutral-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        id={bodyId}
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-0.5 pt-1">
            {section.groups.map((group) => (
              <div key={group.heading || 'default'} className="flex flex-col gap-0.5 pt-1">
                {group.heading && (
                  <span className="px-2 pb-0.5 text-[10px] font-medium tracking-[0.04em] text-neutral-400 dark:text-neutral-500 uppercase">
                    {group.heading}
                  </span>
                )}

                <div className="flex flex-col gap-[1px]">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.end}
                      onClick={onClose}
                      className={({ isActive }) => itemClasses(isActive)}
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon size={16} strokeWidth={1.5} className={itemIconClasses(isActive)} />
                          <span className="truncate">{item.label}</span>
                          {item.badgeKey && <PendingBadge count={pendingCount} />}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Rail icon button                                                    */
/* ------------------------------------------------------------------ */

const RailButton = ({ section, isActive, hasPending, onHover }) => (
  <NavLink
    to={section.groups[0].items[0].path}
    aria-label={`${section.label} — open submenu`}
    onMouseEnter={onHover}
    onFocus={onHover}
    className={({ isActive: linkActive }) => `
      relative flex items-center justify-center w-9 h-9 rounded-[7px] transition-colors outline-none
      focus-visible:ring-1 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500
      ${isActive || linkActive
        ? 'bg-neutral-200/70 dark:bg-white/[0.06] text-neutral-900 dark:text-neutral-100'
        : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200/40 dark:hover:bg-white/[0.03] hover:text-neutral-800 dark:hover:text-neutral-200'
      }
    `}
  >
    <section.icon size={17} strokeWidth={1.5} />
    {hasPending && (
      <span
        aria-hidden="true"
        className="absolute top-1.5 right-1.5 w-[7px] h-[7px] rounded-full bg-amber-500 ring-2 ring-[#f9f9fb] dark:ring-[#111112]"
      />
    )}
  </NavLink>
);

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

const Sidebar = ({ isDarkMode, onToggleTheme, onClose }) => {
  const location = useLocation();
  const adminUser = JSON.parse(localStorage.getItem('admin_user') || '{}');
  const [pendingCount, setPendingCount] = useState(null);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);

  // Rail (collapsed) mode — preference persists, but only ever *applies* on
  // desktop (≥1024px); the mobile drawer always renders full-width.
  const [isRail, setIsRail] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return false;
    return localStorage.getItem('sidebar_rail') === 'true';
  });
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  const [expanded, setExpanded] = useState(() => {
    const defaults = {};
    for (const section of sections) {
      defaults[section.label] = section.groups.some((g) =>
        g.items.some((i) => isPathInSection(location.pathname, i.path))
      );
    }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === 'object') {
        return { ...defaults, ...saved };
      }
    } catch {
      // corrupted saved state — fall through to defaults
    }
    return defaults;
  });

  // Flyout state: which section is hovered open, and where its anchor is
  const [flyout, setFlyout] = useState(null); // { label, top }
  const openTimer = useRef(null);
  const closeTimer = useRef(null);

  useEffect(() => {
    localStorage.setItem('sidebar_rail', JSON.stringify(isRail));
  }, [isRail]);

  // Track desktop breakpoint so the rail never cramps the mobile drawer
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
  }, [expanded]);

  // Auto-expand the section containing the active route on navigation
  useEffect(() => {
    const activeSection = sections.find((s) =>
      s.groups.some((g) => g.items.some((i) => isPathInSection(location.pathname, i.path)))
    );
    if (activeSection) {
      setExpanded((prev) =>
        prev[activeSection.label] ? prev : { ...prev, [activeSection.label]: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) return;

    const fetchPending = async () => {
      try {
        const { default: adminAPI } = await import('@/api/adminAPI');
        const res = await adminAPI.get('/blogs/dashboard/stats');
        if (res.success && res.stats) {
          setPendingCount(res.stats.pending);
        }
      } catch {
        // pending count is optional — ignore fetch failures
      }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close any open flyout when leaving rail mode
  useEffect(() => {
    if (!isRail) {
      setFlyout(null);
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    }
  }, [isRail]);

  useEffect(() => () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    window.location.href = '/login';
  };

  /* ---------------- flyout hover-intent handlers ---------------- */

  const scheduleFlyoutOpen = useCallback((section, anchorEl) => {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => {
      const rect = anchorEl.getBoundingClientRect();
      setFlyout({ label: section.label, top: rect.top });
    }, HOVER_OPEN_DELAY);
  }, []);

  const scheduleFlyoutClose = useCallback(() => {
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setFlyout(null), HOVER_CLOSE_DELAY);
  }, []);

  const cancelFlyoutClose = useCallback(() => {
    clearTimeout(closeTimer.current);
  }, []);

  const closeFlyout = useCallback(() => setFlyout(null), []);

  const isSectionActive = (section) =>
    section.groups.some((g) => g.items.some((i) => isPathInSection(location.pathname, i.path)));

  const hasPendingBadge = (section) =>
    pendingCount > 0 &&
    section.groups.some((g) => g.items.some((i) => i.badgeKey));

  /* ---------------- shared footer rows ---------------- */

  const footerRows = (rail) => {
    const rowBase = `
      flex items-center gap-2.5 rounded-[5px] text-[13px] transition-colors group outline-none
      ${rail ? 'justify-center w-9 h-9 mx-auto' : 'w-full px-2 py-[5px]'}
    `;
    const railTip = (label) => (rail ? { title: label } : {});

    return (
      <>
        <NavLink
          to="/settings"
          onClick={onClose}
          aria-label="Settings"
          {...railTip('Settings')}
          className={({ isActive }) => `
            ${rowBase}
            ${isActive
              ? 'bg-neutral-200/70 dark:bg-white/[0.06] font-medium text-neutral-900 dark:text-neutral-100'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/40 dark:hover:bg-white/[0.03] hover:text-neutral-900 dark:hover:text-neutral-200'
            }
          `}
        >
          {({ isActive }) => (
            <>
              <Settings
                size={16}
                strokeWidth={1.5}
                className={itemIconClasses(isActive)}
              />
              {!rail && <span className="truncate">Settings</span>}
            </>
          )}
        </NavLink>

        <button
          type="button"
          onClick={() => onToggleTheme && onToggleTheme()}
          aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          {...railTip(isDarkMode ? 'Light Mode' : 'Dark Mode')}
          className={`${rowBase} ${
            'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/40 dark:hover:bg-white/[0.03] hover:text-neutral-900 dark:hover:text-neutral-200'
          } cursor-pointer`}
        >
          {isDarkMode ? (
            <Sun size={16} strokeWidth={1.5} className={itemIconClasses(false)} />
          ) : (
            <Moon size={16} strokeWidth={1.5} className={itemIconClasses(false)} />
          )}
          {!rail && <span className="truncate">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          {...railTip('Log Out')}
          className={`${rowBase} ${
            'text-neutral-600 dark:text-neutral-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400'
          } cursor-pointer`}
        >
          <LogOut
            size={16}
            strokeWidth={1.5}
            className="shrink-0 text-neutral-500 dark:text-neutral-400 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors"
          />
          {!rail && <span className="truncate">Log Out</span>}
        </button>
      </>
    );
  };

  /* ---------------- render ---------------- */

  // The rail is a desktop affordance; on narrow screens the preference is
  // kept but the drawer renders full-width.
  const railMode = isRail && isDesktop;

  return (
    <aside
      className={`h-full flex flex-col bg-[#f9f9fb] dark:bg-[#111112] border-r border-neutral-200/60 dark:border-white/[0.04] text-neutral-800 dark:text-neutral-300 transition-[width] duration-200 ease-out selection:bg-neutral-200 dark:selection:bg-neutral-800 ${
        railMode ? 'w-[60px]' : 'w-[220px]'
      }`}
    >

      {/* Workspace Switcher Header */}
      <div className={`shrink-0 flex items-center ${railMode ? 'justify-center px-0 py-3' : 'p-3 justify-between'}`}>
        {railMode ? (
          <div
            className="w-8 h-8 rounded-md overflow-hidden shrink-0 border border-neutral-200/80 dark:border-white/10 cursor-pointer hover:ring-1 hover:ring-neutral-300 dark:hover:ring-white/10 transition-shadow"
            title={adminUser.username || 'Admin Workspace'}
          >
            <img
              src={adminUser.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin'}
              alt="Avatar"
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <>
            <div
              onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
              className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-200/50 dark:hover:bg-white/5 cursor-pointer transition-colors group"
            >
              <div className="w-5 h-5 rounded overflow-hidden shrink-0 border border-neutral-200/80 dark:border-white/10">
                <img
                  src={adminUser.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin'}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[13px] font-semibold text-neutral-850 dark:text-neutral-200 truncate leading-tight">
                  {adminUser.username || 'Admin Workspace'}
                </h2>
              </div>
              <ChevronsUpDown size={14} className="text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors shrink-0" />
            </div>

            {/* Mobile Close Button */}
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 ml-1 rounded hover:bg-neutral-200/50 dark:hover:bg-white/5 text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition-colors lg:hidden"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            )}
          </>
        )}
      </div>

      {/* ---------- RAIL MODE ---------- */}
      {railMode ? (
        <>
          <nav
            aria-label="Primary"
            className="flex-1 overflow-y-auto overflow-x-visible custom-scrollbar px-2 py-2 flex flex-col gap-1"
            onMouseLeave={scheduleFlyoutClose}
          >
            {sections.map((section) => (
              <div
                key={section.label}
                className="relative"
                onMouseEnter={(e) => scheduleFlyoutOpen(section, e.currentTarget)}
                onMouseLeave={scheduleFlyoutClose}
              >
                <RailButton
                  section={section}
                  isActive={isSectionActive(section)}
                  hasPending={hasPendingBadge(section)}
                  onHover={(e) => scheduleFlyoutOpen(section, e.currentTarget)}
                />
              </div>
            ))}
          </nav>

          {flyout && (
            <Flyout
              section={sections.find((s) => s.label === flyout.label)}
              anchorTop={flyout.top}
              pendingCount={pendingCount}
              onClose={closeFlyout}
            />
          )}
        </>
      ) : (
        /* ---------- EXPANDED MODE ---------- */
        <>
          <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-4">
            {sections.map((section) => (
              <SectionBlock
                key={section.label}
                section={section}
                isOpen={!!expanded[section.label]}
                onToggle={() =>
                  setExpanded((prev) => ({ ...prev, [section.label]: !prev[section.label] }))
                }
                pendingCount={pendingCount}
                onClose={onClose}
              />
            ))}
          </div>
        </>
      )}

      {/* Footer — collapse toggle + shared rows */}
      <div className={`shrink-0 border-t border-neutral-200/50 dark:border-white/[0.04] ${railMode ? 'px-2 py-2' : 'p-3 pt-2'}`}>
        {railMode && (
          <button
            type="button"
            onClick={() => setIsRail(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="flex items-center justify-center w-9 h-9 mx-auto mb-1 rounded-[7px] text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200/40 dark:hover:bg-white/[0.03] hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors outline-none cursor-pointer"
          >
            <PanelLeftOpen size={17} strokeWidth={1.5} />
          </button>
        )}
        <div className={`flex ${railMode ? 'flex-col items-center gap-1' : 'flex-col gap-[1px]'}`}>
          {footerRows(railMode)}
        </div>
        {!railMode && (
          <button
            type="button"
            onClick={() => setIsRail(true)}
            aria-label="Collapse sidebar"
            className="mt-2 flex w-full items-center gap-2.5 px-2 py-[5px] rounded-[5px] text-[13px] text-neutral-500 dark:text-neutral-500 hover:bg-neutral-200/40 dark:hover:bg-white/[0.03] hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors group outline-none cursor-pointer"
          >
            <PanelLeftClose size={16} strokeWidth={1.5} className="shrink-0" />
            <span className="truncate">Collapse</span>
          </button>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
