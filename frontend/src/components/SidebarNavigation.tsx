import React from 'react';
import {
  LayoutDashboard,
  Mic2,
  Activity,
  Volume2,
  Database,
  Sliders,
  GitBranch,
  ShieldCheck,
  Cpu,
  FileText,
  ChevronRight,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tabId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

interface NavSection {
  title?: string;
  items: {
    id: string;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    isPrimary?: boolean;
  }[];
}

export const SidebarNavigation: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpen,
  onToggle,
}) => {
  const sections: NavSection[] = [
    {
      items: [
        {
          id: 'OVERVIEW',
          label: 'OVERVIEW',
          icon: <LayoutDashboard className="w-3.5 h-3.5" />,
        },
        {
          id: 'LIVE_AUDIO',
          label: 'LIVE AUDIO',
          icon: <Mic2 className="w-3.5 h-3.5 text-[#C2D88C]" />,
          badge: 'ACTIVE WORKSPACE',
          isPrimary: true,
        },
        {
          id: 'SIGNAL_ANALYSIS',
          label: 'SIGNAL ANALYSIS',
          icon: <Activity className="w-3.5 h-3.5" />,
        },
        {
          id: 'NOISE_INTELLIGENCE',
          label: 'NOISE INTELLIGENCE',
          icon: <Volume2 className="w-3.5 h-3.5" />,
        },
      ],
    },
    {
      title: 'DATA',
      items: [
        {
          id: 'DATA_ACQUISITION',
          label: 'DATA ACQUISITION',
          icon: <Database className="w-3.5 h-3.5" />,
        },
        {
          id: 'SNR_ANALYSIS',
          label: 'SNR ANALYSIS',
          icon: <Sliders className="w-3.5 h-3.5" />,
        },
        {
          id: 'DATASET_PIPELINE',
          label: 'DATASET PIPELINE',
          icon: <GitBranch className="w-3.5 h-3.5" />,
        },
      ],
    },
    {
      title: 'VALIDATION',
      items: [
        {
          id: 'QUALITY_REPORTING',
          label: 'QUALITY REPORTING',
          icon: <ShieldCheck className="w-3.5 h-3.5" />,
        },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        {
          id: 'PROCESSING_STATUS',
          label: 'PROCESSING STATUS',
          icon: <Cpu className="w-3.5 h-3.5" />,
        },
        {
          id: 'LOGS',
          label: 'LOGS',
          icon: <FileText className="w-3.5 h-3.5" />,
        },
      ],
    },
  ];

  return (
    <aside
      className={`bg-[#070A07] border-r border-[#1C231A] text-[#D0D6CA] font-mono text-xs flex flex-col shrink-0 transition-all duration-200 z-20 select-none ${
        isOpen ? 'w-60' : 'w-14'
      }`}
    >
      {/* Brand Identity / Workspace Indicator */}
      <div className="p-3 border-b border-[#1C231A] flex items-center justify-between">
        {isOpen ? (
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-[#69754B]"></span>
              <span className="font-bold text-xs tracking-wider text-[#E8ECE5] uppercase">
                NIRVAN DEFENCE
              </span>
            </div>
            <div className="text-[9px] text-[#717C67] mt-0.5">AUDIO INTELLIGENCE CONSOLE</div>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <span className="w-2.5 h-2.5 bg-[#69754B] border border-[#879260]"></span>
          </div>
        )}

        <button
          onClick={onToggle}
          className="text-[#69755F] hover:text-[#C2D88C] p-1 cursor-pointer transition-colors"
          title={isOpen ? 'Collapse Navigation' : 'Expand Navigation'}
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto py-2 space-y-4">
        {sections.map((sec, secIdx) => (
          <div key={sec.title || `sec-${secIdx}`} className="space-y-0.5">
            {sec.title && isOpen && (
              <div className="px-3 py-1 text-[9px] text-[#55634B] font-bold tracking-widest uppercase">
                {sec.title}
              </div>
            )}
            {sec.title && !isOpen && (
              <div className="my-1 border-t border-[#141A13]" />
            )}

            {sec.items.map((item) => {
              const isSelected = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-${item.id.toLowerCase()}`}
                  onClick={() => onSelectTab(item.id)}
                  title={!isOpen ? item.label : undefined}
                  className={`w-full flex items-center px-3 py-2 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#182217] text-[#F0F4EC] border-l-2 border-[#879260]'
                      : 'text-[#84927C] hover:bg-[#0E130E] hover:text-[#CCD6C6] border-l-2 border-transparent'
                  }`}
                >
                  <span className="shrink-0 mr-2.5">{item.icon}</span>

                  {isOpen && (
                    <div className="flex-1 flex items-center justify-between min-w-0">
                      <span className="text-[11px] font-semibold truncate tracking-wider">
                        {item.label}
                      </span>
                      {item.badge && (
                        <span className="ml-1.5 px-1.5 py-0.2 bg-[#1C2819] border border-[#3E5232] text-[8px] text-[#A4BA75] font-bold shrink-0">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Classification & System Tag */}
      {isOpen ? (
        <div className="p-3 border-t border-[#1C231A] text-[9px] text-[#55634B] bg-[#050705]">
          <div>SECURITY CLASSIFICATION: LEVEL 3</div>
          <div className="text-[#78856F] mt-0.5">ACOUSTIC DEFENCE WORKSTATION</div>
        </div>
      ) : (
        <div className="p-2 border-t border-[#1C231A] text-center text-[8px] text-[#55634B]">
          L3
        </div>
      )}
    </aside>
  );
};
