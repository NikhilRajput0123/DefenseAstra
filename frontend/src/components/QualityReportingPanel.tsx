import React, { useState } from 'react';
import { QUALITY_STEPS } from '../data/pipelineData';
import { QualityStep, QualityStatus } from '../types';

export const QualityReportingPanel: React.FC = () => {
  const [steps, setSteps] = useState<QualityStep[]>(QUALITY_STEPS);
  const [selectedStep, setSelectedStep] = useState<QualityStep>(QUALITY_STEPS[0]);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);

  const getStatusBadge = (status: QualityStatus) => {
    switch (status) {
      case 'PASSED':
        return 'bg-[#152014] text-[#A4BA75] border-[#2C3E26]';
      case 'RUNNING':
        return 'bg-[#141C24] text-[#78A7D8] border-[#243547] animate-pulse';
      case 'WARNING':
        return 'bg-[#222013] text-[#D8C775] border-[#443E24]';
      case 'FAILED':
        return 'bg-[#261515] text-[#D87575] border-[#4A2424]';
      case 'NOT RUN':
      default:
        return 'bg-[#141614] text-[#717C6B] border-[#252B24]';
    }
  };

  const handleRunAllAudits = () => {
    setIsAuditing(true);
    // Mark first step running
    setSteps(prev => prev.map((s, i) => (i === 0 ? { ...s, status: 'RUNNING' } : s)));

    setTimeout(() => {
      // Step 1 pass, Step 2 running
      setSteps(prev =>
        prev.map((s, i) => {
          if (i === 0) return { ...s, status: 'PASSED', lastRun: 'JUST NOW' };
          if (i === 1) return { ...s, status: 'RUNNING' };
          return s;
        })
      );
    }, 900);

    setTimeout(() => {
      // Step 2 pass, Step 3 running
      setSteps(prev =>
        prev.map((s, i) => {
          if (i === 1) return { ...s, status: 'PASSED', lastRun: 'JUST NOW' };
          if (i === 2) return { ...s, status: 'RUNNING' };
          return s;
        })
      );
    }, 1800);

    setTimeout(() => {
      // All passed
      setSteps(prev =>
        prev.map(s => ({
          ...s,
          status: 'PASSED',
          lastRun: 'JUST NOW'
        }))
      );
      setIsAuditing(false);
    }, 2700);
  };

  const handleReset = () => {
    setSteps(QUALITY_STEPS);
    setIsAuditing(false);
  };

  return (
    <section className="bg-[#0B0E0B] border border-[#232B20] p-3 font-mono text-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-2 mb-3 border-b border-[#1F261C]">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 bg-[#69754B]"></span>
          <span className="font-bold text-[#E2E6DF] tracking-wider uppercase">
            QUALITY REPORTING &amp; VALIDATION
          </span>
          <span className="text-[10px] text-[#717C67]">
            [ZERO-LEAKAGE INTEGRITY SUITE]
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            id="btn-run-audits"
            disabled={isAuditing}
            onClick={handleRunAllAudits}
            className={`px-3 py-1 font-semibold border text-[11px] transition-colors ${
              isAuditing
                ? 'bg-[#182017] border-[#2E3B27] text-[#77866D] cursor-not-allowed'
                : 'bg-[#1C2618] border-[#4D633D] text-[#C2D88C] hover:bg-[#253320]'
            }`}
          >
            {isAuditing ? 'AUDITING...' : 'EXECUTE VALIDATION SUITE'}
          </button>
          <button
            onClick={handleReset}
            className="px-2 py-1 bg-[#121612] border border-[#232B20] text-[#77846E] hover:text-[#BFCAB4] text-[11px]"
          >
            RESET
          </button>
        </div>
      </div>

      {/* Process Flow Banner: DATASET ↓ LEAKAGE CHECKS ↓ AUTOMATED VALIDATION ↓ DATASET REPORT */}
      <div className="flex items-center justify-between p-2 mb-3 bg-[#0E120E] border border-[#1E251B] text-[11px] overflow-x-auto">
        <span className="px-2 py-1 bg-[#131913] text-[#A6B494] font-semibold shrink-0">
          DATASET
        </span>
        <span className="text-[#4E5A47] px-1 shrink-0">↓</span>
        <span className="px-2 py-1 bg-[#131913] text-[#A6B494] font-semibold shrink-0">
          LEAKAGE CHECKS
        </span>
        <span className="text-[#4E5A47] px-1 shrink-0">↓</span>
        <span className="px-2 py-1 bg-[#131913] text-[#A6B494] font-semibold shrink-0">
          AUTOMATED VALIDATION
        </span>
        <span className="text-[#4E5A47] px-1 shrink-0">↓</span>
        <span className="px-2 py-1 bg-[#131913] text-[#A6B494] font-semibold shrink-0">
          DATASET REPORT
        </span>
      </div>

      {/* 3 Quality Reporting Modules Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        {steps.map((step) => {
          const isSelected = selectedStep.id === step.id;
          return (
            <div
              key={step.id}
              onClick={() => setSelectedStep(step)}
              className={`p-3 border cursor-pointer transition-colors flex flex-col justify-between ${
                isSelected ? 'bg-[#182017] border-[#879260]' : 'bg-[#0E120E] border-[#22291F] hover:border-[#384632]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-[#E2E6DF] text-[11px]">
                    {step.name}
                  </span>
                  <span className={`px-2 py-0.5 border text-[9px] font-semibold ${getStatusBadge(step.status)}`}>
                    {step.status}
                  </span>
                </div>
                <div className="text-[10px] text-[#717E67] mb-2 font-mono">
                  Module: <code className="text-[#B5C29E]">{step.module}</code>
                </div>
                <p className="text-[10px] text-[#86927C] leading-relaxed">
                  {step.description}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-[#1C231A] flex justify-between text-[9px] text-[#606D56]">
                <span>CHECKS DEFINED: {step.checksDetail?.length || 0}</span>
                <span>LAST RUN: {step.lastRun || '--'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed Check Inspector */}
      <div className="p-3 bg-[#0E120E] border border-[#1E251B]">
        <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-[#1A2218]">
          <span className="font-bold text-[#D0D6CA] text-[11px] uppercase">
            AUDIT CHECKLIST: {selectedStep.name}
          </span>
          <span className="text-[10px] text-[#6C7861]">
            STATUS: <span className="text-[#C2D88C] font-semibold">{selectedStep.status}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {selectedStep.checksDetail?.map((chk, idx) => (
            <div key={idx} className="flex items-center space-x-2 bg-[#090C09] p-2 border border-[#192117] text-[10px]">
              <span className={`w-1.5 h-1.5 ${selectedStep.status === 'PASSED' ? 'bg-[#9CB074]' : 'bg-[#55634B]'}`}></span>
              <span className="text-[#BAC5AF]">{chk}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
