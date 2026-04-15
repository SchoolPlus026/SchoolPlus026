import React from 'react';
import { PieChart as PieIcon, TrendingUp, Calendar } from 'lucide-react';

export default function StudentAttendanceChart({ attendanceData }) {
  // attendanceData expected: [{ status: 'Present' }, { status: 'Absent' }, ...]
  
  const stats = attendanceData?.reduce((acc, curr) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    acc.total += 1;
    return acc;
  }, { total: 0, Present: 0, Absent: 0, Late: 0, Half_day: 0 }) || { total: 0, Present: 0, Absent: 0, Late: 0, Half_day: 0 };

  const presentPct = stats.total > 0 ? Math.round((stats.Present / stats.total) * 100) : 0;
  const absentPct = stats.total > 0 ? Math.round((stats.Absent / stats.total) * 100) : 0;
  const latePct = stats.total > 0 ? Math.round((stats.Late / stats.total) * 100) : 0;

  // Simple SVG Pie Chart Logic
  const RADIUS = 70;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const getStroke = (pct) => {
    return (pct / 100) * CIRCUMFERENCE;
  };

  return (
    <div className="bg-white border border-border rounded-[2.5rem] p-8 shadow-xl shadow-slate-100/50">
      <div className="flex items-center justify-between mb-10">
        <div>
           <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Attendance Summary</h3>
           <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Lifecycle Tracking Analysis</p>
        </div>
        <div className="p-3 bg-indigo-50 rounded-2xl text-primary">
           <PieIcon size={24} />
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-12">
        {/* SVG Pie Chart Container */}
        <div className="relative w-48 h-48 flex items-center justify-center">
           <svg className="w-full h-full transform -rotate-90">
              {/* Background Circle */}
              <circle cx="96" cy="96" r={RADIUS} fill="transparent" stroke="#f1f5f9" strokeWidth="20" />
              
              {/* Late Segment */}
              <circle 
                cx="96" cy="96" r={RADIUS} fill="transparent" stroke="#f59e0b" strokeWidth="20" 
                strokeDasharray={`${getStroke(latePct + absentPct + presentPct)} ${CIRCUMFERENCE}`}
                className="transition-all duration-1000"
              />

              {/* Absent Segment */}
              <circle 
                cx="96" cy="96" r={RADIUS} fill="transparent" stroke="#ef4444" strokeWidth="20" 
                strokeDasharray={`${getStroke(absentPct + presentPct)} ${CIRCUMFERENCE}`}
                className="transition-all duration-1000"
              />

              {/* Present Segment */}
              <circle 
                cx="96" cy="96" r={RADIUS} fill="transparent" stroke="#6366f1" strokeWidth="20" 
                strokeDasharray={`${getStroke(presentPct)} ${CIRCUMFERENCE}`}
                className="transition-all duration-1000"
              />
           </svg>
           
           <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-black text-slate-800">{presentPct}%</span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Present</span>
           </div>
        </div>

        {/* Legend / Metrics */}
        <div className="flex-1 w-full space-y-6">
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                 <div className="w-3 h-3 rounded-full bg-primary shadow-lg shadow-indigo-200"></div>
                 <div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Present</div>
                    <div className="text-lg font-black text-slate-700">{stats.Present} sessions</div>
                 </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                 <div className="w-3 h-3 rounded-full bg-red-500 shadow-lg shadow-red-200"></div>
                 <div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Absent</div>
                    <div className="text-lg font-black text-slate-700">{stats.Absent} sessions</div>
                 </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
                 <div className="w-3 h-3 rounded-full bg-amber-500 shadow-lg shadow-amber-200"></div>
                 <div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Late</div>
                    <div className="text-lg font-black text-slate-700">{stats.Late} sessions</div>
                 </div>
              </div>
              <div className="bg-slate-800 p-4 rounded-2xl flex items-center gap-4 shadow-xl">
                 <Calendar className="text-indigo-400" size={20} />
                 <div>
                    <div className="text-[10px] font-black text-indigo-300 uppercase tracking-widest leading-none">Total Cycle</div>
                    <div className="text-lg font-black text-white">{stats.total} Days</div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
