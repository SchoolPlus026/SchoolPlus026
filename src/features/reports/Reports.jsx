import React, { useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { BarChart2, FileText, FileSpreadsheet, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

// ─── Reliable download helper ─────────────────────────────────────────────────
// Always appends the <a> to the DOM, clicks it, then removes it.
// This is the ONLY pattern that works consistently across browsers, WebViews, and iOS/Android.
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Small delay before revoking so the browser has time to start the download
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

export default function Reports() {
  const { role, schoolSettings } = useAppStore();
  const [reportType, setReportType] = useState('attendance');
  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState('success'); // 'success' | 'error'

  // ── Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterRole, setFilterRole] = useState(''); // 'student' or 'teacher' or ''
  
  const userRole = (role || '').toLowerCase();
  const classes = schoolSettings?.classes || [];

  function showToast(msg, type = 'success') {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(''), 4000);
  }

  if (userRole !== 'admin') {
    return <div className="sp-card text-slate-400 text-sm">Access Denied. Reports are for Admins only.</div>;
  }

  // ─── Fetch data based on current reportType + filters ─────────────────────
  const fetchReportData = async () => {
    let data, headers;

    if (reportType === 'attendance') {
      let q = supabase
        .from('attendance')
        .select('date, role, status, user:users(name, class, username)')
        .eq('school_id', schoolSettings.school_id)
        .order('date', { ascending: false });
        
      if (fromDate) q = q.gte('date', fromDate);
      if (toDate)   q = q.lte('date', toDate);
      
      const { data: rawRecords, error } = await q;
      if (error) throw new Error(`Failed to fetch attendance: ${error.message}`);
      
      let records = rawRecords || [];
      if (filterRole)  records = records.filter(r => r.role === filterRole);
      if (filterClass) records = records.filter(r => r.user?.class === filterClass);

      headers = ['Date', 'Name', 'Username', 'Class', 'Role', 'Status'];
      data = records.map(r => ({
        Date:     r.date,
        Name:     r.user?.name     || 'Unknown',
        Username: r.user?.username || '',
        Class:    r.user?.class    || '-',
        Role:     r.role,
        Status:   r.status,
      }));

    } else if (reportType === 'fees') {
      let q = supabase
        .from('fees')
        .select('*, student:users(username, name, class), fees_payments(amount)')
        .eq('school_id', schoolSettings.school_id);
        
      const { data: rawRecords, error } = await q;
      if (error) throw new Error(`Failed to fetch fees: ${error.message}`);

      let records = rawRecords || [];
      if (filterClass) records = records.filter(f => f.student?.class === filterClass);

      headers = ['Student Name', 'Username', 'Class', 'Year', 'Last Year Due', 'Total Fee', 'Total Paid', 'Due Amount'];
      data = records.map(f => {
        const paid = (f.fees_payments || []).reduce((sum, p) => sum + p.amount, 0);
        const due  = (f.last_year_pending || 0) + f.total - paid;
        return {
          'Student Name':   f.student?.name     || 'Unknown',
          'Username':       f.student?.username || '',
          'Class':          f.student?.class    || '-',
          'Year':           f.year,
          'Last Year Due':  f.last_year_pending || 0,
          'Total Fee':      f.total,
          'Total Paid':     paid,
          'Due Amount':     due,
        };
      });
    }

    return { data, headers };
  };

  const generateReport = async (format) => {
    setLoading(true);
    const fileName = `${reportType}_report_${new Date().toISOString().split('T')[0]}`;
    const schoolName = schoolSettings?.name || 'School';

    try {
      const { data, headers } = await fetchReportData();

      if (!data || data.length === 0) {
        showToast('No data found matching the selected filters.', 'error');
        return;
      }

      // ── PDF Export ───────────────────────────────────────────────────────
      if (format === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const { default: autoTable } = await import('jspdf-autotable');

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(`${schoolName}`, 14, 14);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`, 14, 21);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 27);
        doc.setTextColor(0);

        // Table
        autoTable(doc, {
          head: [headers],
          body: data.map(row => headers.map(h => row[h] ?? '')),
          startY: 32,
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [248, 249, 250] },
        });

        // Trigger download via blob (works in all environments including Capacitor)
        const pdfBlob = doc.output('blob');
        triggerDownload(pdfBlob, `${fileName}.pdf`);
        showToast(`✅ PDF downloaded: ${fileName}.pdf`);
      }

      // ── Excel (.xlsx) Export ─────────────────────────────────────────────
      else if (format === 'excel') {
        // Build worksheet from array of objects — XLSX handles headers automatically
        const ws = XLSX.utils.json_to_sheet(data, { header: headers });

        // Style the header row (column widths)
        const colWidths = headers.map(h => ({ wch: Math.max(h.length + 4, 16) }));
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, reportType.charAt(0).toUpperCase() + reportType.slice(1));

        // Write to array buffer → Blob → download
        const wbBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        triggerDownload(blob, `${fileName}.xlsx`);
        showToast(`✅ Excel downloaded: ${fileName}.xlsx`);
      }

    } catch (err) {
      console.error('[Reports] Export error:', err);
      showToast(`Export failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 fade-in pb-10">
      <div className="sp-card">
        <div className="flex items-center gap-3">
          <BarChart2 size={18} className="text-indigo-400" />
          <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">Reports & Exports</h3>
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className={`fixed left-1/2 -translate-x-1/2 bottom-6 z-50 border text-sm font-semibold px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 transition-all ${
          toastType === 'error'
            ? 'bg-red-950 border-red-500/30 text-red-300'
            : 'bg-slate-900 border-white/10 text-white'
        }`}>
          {toastType === 'error'
            ? <AlertCircle size={14} className="text-red-400" />
            : <CheckCircle size={14} className="text-emerald-400" />}
          {toastMsg}
        </div>
      )}

      <div className="sp-card space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={e => { setReportType(e.target.value); setFilterRole(''); }}
              className="sp-input"
            >
               <option value="attendance">Attendance Log</option>
               <option value="fees">Fees Outstanding</option>
            </select>
          </div>

          {reportType === 'attendance' && (
            <>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">From Date</label>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="sp-input" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">To Date</label>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="sp-input" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Target Persona</label>
                <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="sp-input">
                  <option value="">All Personas</option>
                  <option value="student">Students Only</option>
                  <option value="teacher">Teachers Only</option>
                </select>
              </div>
            </>
          )}

          {(reportType === 'fees' || filterRole === 'student') && (
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Class Filter</label>
              <select value={filterClass} onChange={e => setFilterClass(e.target.value)} className="sp-input">
                <option value="">All Classes</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            id="btn-generate-pdf"
            onClick={() => generateReport('pdf')}
            disabled={loading}
            className="btn-primary flex items-center gap-2 text-sm whitespace-nowrap"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Generate PDF Report
          </button>

          <button
            id="btn-export-excel"
            onClick={() => generateReport('excel')}
            disabled={loading}
            className="btn-primary flex items-center gap-2 text-sm whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #166534, #15803d)' }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
            Export to Excel (.xlsx)
          </button>
        </div>

        <p className="text-[11px] text-slate-500">
          PDF exports a formatted A4 landscape report. Excel exports a native <code>.xlsx</code> file openable in Microsoft Excel, Google Sheets, or LibreOffice.
        </p>
      </div>
    </div>
  );
}
