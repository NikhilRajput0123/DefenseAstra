import React, { useState } from 'react';
import { ACTUAL_DATA_SOURCES } from '../data/pipelineData';
import { DataSourceItem, DataSourceStatus } from '../types';

export const DataAcquisitionTable: React.FC = () => {
  const [sources, setSources] = useState<DataSourceItem[]>(ACTUAL_DATA_SOURCES);
  const [selectedSource, setSelectedSource] = useState<DataSourceItem>(ACTUAL_DATA_SOURCES[0]);

  const getStatusBadge = (status: DataSourceStatus) => {
    switch (status) {
      case 'READY':
        return 'bg-[#152014] text-[#A4BA75] border-[#2C3E26]';
      case 'STAGING':
        return 'bg-[#222013] text-[#D8C775] border-[#443E24]';
      case 'PROCESSING':
        return 'bg-[#141C24] text-[#78A7D8] border-[#243547]';
      case 'ERROR':
        return 'bg-[#261515] text-[#D87575] border-[#4A2424]';
      case 'NOT CONNECTED':
      default:
        return 'bg-[#141614] text-[#717C6B] border-[#252B24]';
    }
  };

  const handleSourceStatusToggle = (id: string, newStatus: DataSourceStatus) => {
    setSources(prev =>
      prev.map(s => {
        if (s.id === id) {
          const updated = { ...s, status: newStatus };
          if (selectedSource.id === id) setSelectedSource(updated);
          return updated;
        }
        return s;
      })
    );
  };

  return (
    <section className="bg-[#0B0E0B] border border-[#232B20] p-3 font-mono text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-2 mb-3 border-b border-[#1F261C]">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 bg-[#69754B]"></span>
          <span className="font-bold text-[#E2E6DF] tracking-wider uppercase">
            DATA ACQUISITION REPOSITORY
          </span>
          <span className="text-[10px] text-[#717C67]">
            [INGESTION SOURCES &amp; STAGING DIRECTORIES]
          </span>
        </div>
        <div className="text-[10px] text-[#7F8C72]">
          TOTAL CORPORA: <span className="text-[#CBD4C2] font-semibold">{sources.length}</span>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto border border-[#1F261C] mb-3">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#101410] text-[#717C67] border-b border-[#1F261C] text-[10px] uppercase">
              <th className="py-2 px-3">SOURCE</th>
              <th className="py-2 px-3">STATUS</th>
              <th className="py-2 px-3">TYPE</th>
              <th className="py-2 px-3">FILES</th>
              <th className="py-2 px-3">STAGING PATH</th>
              <th className="py-2 px-3 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#181F16] text-[11px]">
            {sources.map((src) => {
              const isSelected = selectedSource.id === src.id;
              return (
                <tr
                  key={src.id}
                  onClick={() => setSelectedSource(src)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#182017]' : 'bg-[#0E120E] hover:bg-[#131812]'
                  }`}
                >
                  <td className="py-2.5 px-3 font-bold text-[#E2E6DF]">
                    {src.source}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`inline-block px-2 py-0.5 border text-[10px] font-semibold ${getStatusBadge(src.status)}`}>
                      {src.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-[#9AA592] max-w-xs truncate">
                    {src.type}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-[#8C9881]">
                    {src.files}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[10px] text-[#77866D]">
                    {src.staging}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const next: DataSourceStatus =
                          src.status === 'READY'
                            ? 'STAGING'
                            : src.status === 'STAGING'
                            ? 'NOT CONNECTED'
                            : 'READY';
                        handleSourceStatusToggle(src.id, next);
                      }}
                      className="px-2 py-1 bg-[#131913] border border-[#263122] text-[#869476] hover:text-[#C5CDC0] text-[10px]"
                    >
                      TOGGLE
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selected Source Inspector Detail Card */}
      <div className="p-3 bg-[#0E120E] border border-[#1E251B]">
        <div className="flex flex-wrap items-center justify-between pb-1.5 mb-2 border-b border-[#1A2218]">
          <span className="font-bold text-[#D0D6CA] text-[11px] uppercase">
            INGESTION METADATA: {selectedSource.source}
          </span>
          <span className="text-[10px] text-[#69755F]">
            ORCHESTRATOR: {selectedSource.moduleRef || 'dataset_builder.py'}
          </span>
        </div>
        <p className="text-[11px] text-[#93A087] mb-2 leading-relaxed">
          {selectedSource.description}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px]">
          <div className="bg-[#090C09] p-2 border border-[#1A2218]">
            <div className="text-[#64705A] text-[9px] uppercase">DIRECTORY</div>
            <div className="font-mono text-[#BAC5AC] mt-0.5 truncate">{selectedSource.staging}</div>
          </div>
          <div className="bg-[#090C09] p-2 border border-[#1A2218]">
            <div className="text-[#64705A] text-[9px] uppercase">SOURCE DISPOSITION</div>
            <div className="font-mono text-[#BAC5AC] mt-0.5">{selectedSource.type}</div>
          </div>
          <div className="bg-[#090C09] p-2 border border-[#1A2218]">
            <div className="text-[#64705A] text-[9px] uppercase">FILE COUNT RECORD</div>
            <div className="font-mono text-[#BAC5AC] mt-0.5">{selectedSource.files}</div>
          </div>
          <div className="bg-[#090C09] p-2 border border-[#1A2218]">
            <div className="text-[#64705A] text-[9px] uppercase">CURRENT STATUS</div>
            <div className="font-semibold text-[#A4BA75] mt-0.5">{selectedSource.status}</div>
          </div>
        </div>
      </div>
    </section>
  );
};
