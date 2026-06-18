import React, { useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { BarChart2, FileText, FileSpreadsheet, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// ─── Environment-aware file download/share helper ─────────────────────────────
//
// WEB (Netlify / browser):
//   Creates a blob:// URL, appends a hidden <a download> to the DOM, clicks it,
//   then revokes the URL. This is the correct pattern for all desktop browsers.
//
// NATIVE Android (Capacitor APK):
//   blob:// URLs are silently blocked by Android's WebView DownloadManager.
//   Instead we:
//     1. Convert the Blob to base64
//     2. Write it to the device's Documents directory via @capacitor/filesystem
//     3. Open Android's native Share Sheet via @capacitor/share
//        → user can pick "Open with Microsoft Excel", "Save to Files", etc.
//
async function triggerDownload(blob, filename) {
  if (Capacitor.isNativePlatform()) {
    // ── Native Android path ───────────────────────────────────────────────
    // Step 1: Convert blob → base64 string
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array  = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64Data = btoa(binary);

    // Step 2: Write file to Documents directory
    const writeResult = await Filesystem.writeFile({
      path:      filename,
      data:      base64Data,
      directory: Directory.Documents,
    });

    // Step 3: Open native Android share sheet so user can open/save the file
    await Share.share({
      title:      filename,
      url:        writeResult.uri,
      dialogTitle: `Open or save ${filename}`,
    });

  } else {
    // ── Web / browser path ────────────────────────────────────────────────
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }
}

const STATUS_DECODE = { P: 'Present', A: 'Absent', L: 'Late', H: 'Half_day', V: 'Leave' };

// Reconstruct list of individual date records from JSONB Monthly Rollup
function reconstructAttendanceRows(records, fromDate, toDate) {
  const rows = [];
  
  records.forEach(rec => {
    const data = rec.attendance_data || {};
    const monthYear = rec.month_year; // e.g. "2026-06"
    
    Object.keys(data).forEach(key => {
      let dateStr;
      if (key.includes('-')) {
        // Legacy full ISO date key
        dateStr = key;
      } else {
        // Compressed day key
        const day = key.padStart(2, '0');
        dateStr = `${monthYear}-${day}`;
      }
      
      // Filter by fromDate and toDate if provided
      if (fromDate && dateStr < fromDate) return;
      if (toDate && dateStr > toDate) return;
      
      const rawStatus = data[key];
      const decodedStatus = STATUS_DECODE[rawStatus] || rawStatus;
      
      rows.push({
        date: dateStr,
        user: rec.user,
        // role is now sourced from the joined user record (v48 removed top-level role column)
        role: rec.user?.role || '',
        status: decodedStatus
      });
    });
  });
  
  // Sort by date descending, then by class, then by user name
  rows.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    const classA = a.user?.class || '';
    const classB = b.user?.class || '';
    if (classA !== classB) return classA.localeCompare(classB);
    const nameA = a.user?.name || '';
    const nameB = b.user?.name || '';
    return nameA.localeCompare(nameB);
  });
  
  return rows;
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
  const [teachers, setTeachers] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  
  const userRole = (role || '').toLowerCase();
  const classes = schoolSettings?.classes || [];

  React.useEffect(() => {
    if (reportType === 'leaves' && schoolSettings?.school_id) {
      const fetchTeachers = async () => {
        const { data, error } = await supabase
          .from('users')
          .select('id, name')
          .eq('school_id', schoolSettings.school_id)
          .eq('role', 'teacher')
          .order('name');
        if (!error && data) {
          setTeachers(data);
        }
      };
      fetchTeachers();
    }
  }, [reportType, schoolSettings?.school_id]);

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
        // 'role' column was removed from attendance table in v48 JSONB refactor.
        // It is now derived from the joined users record.
        .select('month_year, attendance_data, user:users(name, class, username, role)')
        .eq('school_id', schoolSettings.school_id);
        
      if (fromDate) q = q.gte('month_year', fromDate.substring(0, 7));
      if (toDate)   q = q.lte('month_year', toDate.substring(0, 7));
      
      const { data: rawRecords, error } = await q;
      if (error) throw new Error(`Failed to fetch attendance: ${error.message}`);
      
      let filteredRaw = rawRecords || [];
      // Filter by role via the joined user record (not a top-level column post-v48)
      if (filterRole)  filteredRaw = filteredRaw.filter(r => r.user?.role === filterRole);
      if (filterClass) filteredRaw = filteredRaw.filter(r => r.user?.class === filterClass);

      const records = reconstructAttendanceRows(filteredRaw, fromDate, toDate);

      headers = ['Date', 'Name', 'Username', 'Class', 'Role', 'Status'];
      data = records.map(r => ({
        Date:     r.date,
        Name:     r.user?.name     || 'Unknown',
        Username: r.user?.username || '',
        Class:    r.user?.class    || '-',
        Role:     r.user?.role     || r.role || '-',
        Status:   r.status,
      }));

    } else if (reportType === 'leaves') {
      let q = supabase
        .from('leaves')
        .select('*, user:users(name, class, username)')
        .eq('school_id', schoolSettings.school_id)
        .order('from_date', { ascending: false });

      if (fromDate) q = q.gte('from_date', fromDate);
      if (toDate)   q = q.lte('to_date', toDate);

      const { data: rawRecords, error } = await q;
      if (error) throw new Error(`Failed to fetch leaves: ${error.message}`);

      let records = rawRecords || [];

      if (filterRole) {
        records = records.filter(r => r.role === filterRole);
      }
      if (filterRole === 'student' && filterClass) {
        records = records.filter(r => r.user?.class === filterClass);
      }
      if (filterRole === 'teacher' && selectedTeacherId) {
        records = records.filter(r => r.user_id === selectedTeacherId);
      }

      headers = ['From Date', 'To Date', 'Name', 'Username', 'Class/Role', 'Reason', 'Status'];
      data = records.map(r => ({
        'From Date':  r.from_date,
        'To Date':    r.to_date,
        'Name':       r.user?.name || 'Unknown',
        'Username':   r.user?.username || '',
        'Class/Role': r.role === 'student' ? (r.user?.class || '-') : 'Teacher',
        'Reason':     r.reason || '',
        'Status':     r.status,
      }));

    } else if (reportType === 'fees') {
      let q = supabase
        .from('fees')
        .select('id, yr:year, lyp:last_year_pending, tot:total, student:users(username, name, class), fees_payments(amount)')
        .eq('school_id', schoolSettings.school_id);
        
      const { data: rawRecords, error } = await q;
      if (error) throw new Error(`Failed to fetch fees: ${error.message}`);

      let records = (rawRecords || []).map(f => ({
        id: f.id,
        year: f.yr,
        last_year_pending: Number(f.lyp || 0),
        total: Number(f.tot || 0),
        student: f.student,
        fees_payments: f.fees_payments
      }));
      if (filterClass) records = records.filter(f => f.student?.class === filterClass);

      headers = ['Student Name', 'Username', 'Class', 'Year', 'Last Year Due', 'Total Fee', 'Total Paid', 'Due Amount'];
      data = records.map(f => {
        const paid = (f.fees_payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
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

        // Trigger download (web) or share sheet (Android native)
        const pdfBlob = doc.output('blob');
        await triggerDownload(pdfBlob, `${fileName}.pdf`);
        showToast(Capacitor.isNativePlatform()
          ? '✅ PDF ready — select an app to open or save it.'
          : `✅ PDF downloaded: ${fileName}.pdf`
        );
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
        await triggerDownload(blob, `${fileName}.xlsx`);
        showToast(Capacitor.isNativePlatform()
          ? '✅ Excel ready — select an app to open or save it.'
          : `✅ Excel downloaded: ${fileName}.xlsx`
        );
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
              onChange={e => { setReportType(e.target.value); setFilterRole(''); setFilterClass(''); setSelectedTeacherId(''); }}
              className="sp-input"
            >
               <option value="attendance">Attendance Log</option>
               <option value="fees">Fees Outstanding</option>
               <option value="leaves">Leave Log</option>
            </select>
          </div>

          {(reportType === 'attendance' || reportType === 'leaves') && (
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
                <select value={filterRole} onChange={e => { setFilterRole(e.target.value); setFilterClass(''); setSelectedTeacherId(''); }} className="sp-input">
                  <option value="">All Personas</option>
                  <option value="student">Students Only</option>
                  <option value="teacher">Teachers Only</option>
                </select>
              </div>
            </>
          )}

          {((reportType === 'fees') || (reportType === 'attendance' && filterRole === 'student') || (reportType === 'leaves' && filterRole === 'student')) && (
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Class Filter</label>
              <select value={filterClass} onChange={e => setFilterClass(e.target.value)} className="sp-input">
                <option value="">All Classes</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {reportType === 'leaves' && filterRole === 'teacher' && (
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Teacher Filter</label>
              <select value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)} className="sp-input">
                <option value="">All Teachers</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
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
