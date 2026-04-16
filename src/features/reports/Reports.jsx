import React, { useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { BarChart2, FileText, FileSpreadsheet, Loader2, CheckCircle } from 'lucide-react';

export default function Reports() {
  const { role } = useAppStore();
  const [reportType, setReportType] = useState('attendance');
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const userRole = (role || '').toLowerCase();

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }

  if (userRole !== 'admin') {
    return <div className="sp-card text-slate-400 text-sm">Access Denied. Reports are for Admins only.</div>;
  }

  const generateReport = async (format) => {
    setLoading(true);
    let data, headers;
    const fileName = `${reportType}_report_${new Date().toISOString().split('T')[0]}`;

    if (reportType === 'attendance') {
      const { data: records } = await supabase
        .from('attendance')
        .select('date, who, role, status')
        .order('date', { ascending: false });
      data = (records || []).map(r => [r.date, r.who, r.role, r.status]);
      headers = [['Date', 'Who', 'Role', 'Status']];
    } else if (reportType === 'fees') {
      const { data: records } = await supabase
        .from('fees')
        .select('*, student:users(username, name, class), fees_payments(amount)');
      data = (records || []).map(f => {
        const paid = (f.fees_payments || []).reduce((sum, p) => sum + p.amount, 0);
        return [
          f.student?.name, f.student?.username, f.student?.class,
          f.year, f.last_year_pending || 0, f.total, paid,
          (f.last_year_pending || 0) + f.total - paid
        ];
      });
      headers = [['Student Name', 'Username', 'Class', 'Year', 'Last Year Due', 'Total Fee', 'Total Paid', 'Due Amount']];
    }

    if (!data || data.length === 0) { showToast('No data found to export.'); setLoading(false); return; }

    if (format === 'pdf') {
      // Dynamic import jsPDF if available
      try {
        const { jsPDF } = await import('jspdf');
        await import('jspdf-autotable');
        const doc = new jsPDF();
        doc.setFontSize(14);
        doc.text(`School - ${reportType.toUpperCase()} Report`, 14, 15);
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);
        doc.autoTable({ head: headers, body: data, startY: 28 });
        doc.save(`${fileName}.pdf`);
      } catch {
        // Fallback: export as CSV plaintext if jsPDF not bundled
        const csvContent = [...headers, ...data].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${fileName}.csv`; a.click();
        URL.revokeObjectURL(url);
      }
    } else if (format === 'excel') {
      // Export as CSV (xlsx not bundled in Vite without plugin)
      const rows = [...headers, ...data];
      const csvContent = rows.map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${fileName}.csv`; a.click();
      URL.revokeObjectURL(url);
    }

    showToast('Report exported!');
    setLoading(false);
  };

  return (
    <div className="space-y-4 fade-in pb-10">
      <div className="sp-card">
        <div className="flex items-center gap-3">
          <BarChart2 size={18} className="text-indigo-400" />
          <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">Reports</h3>
        </div>
      </div>

      {toastMsg && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 bg-slate-900 border border-white/10 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2">
          <CheckCircle size={14} className="text-emerald-400" />
          {toastMsg}
        </div>
      )}

      <div className="sp-card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <select
            value={reportType}
            onChange={e => setReportType(e.target.value)}
            className="sp-input flex-1"
          >
            <option value="attendance">Attendance</option>
            <option value="fees">Fees Outstanding</option>
          </select>

          <button
            onClick={() => generateReport('pdf')}
            disabled={loading}
            className="btn-primary flex items-center gap-2 text-sm whitespace-nowrap"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Export PDF
          </button>

          <button
            onClick={() => generateReport('excel')}
            disabled={loading}
            className="btn-primary flex items-center gap-2 text-sm whitespace-nowrap"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
            Export Excel
          </button>
        </div>
      </div>
    </div>
  );
}
