/**
 * ArchiveConsole.jsx — Academic Year Archival Console
 *
 * Purpose:
 *   Allows school admins to archive an entire academic year's data into a
 *   compressed JSON snapshot file stored in Supabase Storage.
 *
 * Flow:
 *   1. Admin selects a past academic year from the dropdown.
 *   2. Clicks "Archive Year" — triggers the `archive_academic_year` RPC.
 *   3. RPC returns the full snapshot + metadata.
 *   4. Frontend uploads the snapshot JSON to Supabase Storage.
 *   5. Admin can then optionally "Purge" the soft-deleted live rows.
 *   6. Archive history is shown below from the `academic_archives` table.
 *
 * Paired with: database/v85_academic_year_archiver.sql
 */

import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import {
  Archive, HardDrive, Loader2, Trash2, Download, CheckCircle2,
  AlertTriangle, ChevronDown, Info, Shield, Calendar
} from 'lucide-react';

export default function ArchiveConsole() {
  const { schoolSettings, user } = useAppStore();
  const schoolId = schoolSettings?.school_id;

  const [selectedYear, setSelectedYear] = useState('');
  const [archives, setArchives] = useState([]);
  const [loadingArchives, setLoadingArchives] = useState(true);
  const [archiving, setArchiving] = useState(false);
  const [purging, setPurging] = useState(null); // year string being purged
  const [result, setResult] = useState(null); // { type: 'success'|'error', message }

  // Build list of archivable years (all past years, up to 5 years back)
  const currentYear = new Date().getFullYear();
  const archivableYears = Array.from({ length: 5 }, (_, i) =>
    String(currentYear - 1 - i)
  );

  useEffect(() => {
    if (schoolId) fetchArchives();
  }, [schoolId]);

  async function fetchArchives() {
    setLoadingArchives(true);
    const { data, error } = await supabase
      .from('academic_archives')
      .select('*')
      .eq('school_id', schoolId)
      .order('academic_year', { ascending: false });

    if (!error && data) setArchives(data);
    setLoadingArchives(false);
  }

  async function handleArchive() {
    if (!selectedYear) return;
    if (!window.confirm(
      `Archive academic year ${selectedYear}?\n\n` +
      `This will:\n` +
      `• Collect all attendance, achievements, and leave data for ${selectedYear}\n` +
      `• Create a downloadable JSON snapshot\n` +
      `• Mark those attendance rows as archived (soft-delete)\n\n` +
      `The live data remains readable until you choose to Purge it.\n` +
      `This action cannot be undone.`
    )) return;

    setArchiving(true);
    setResult(null);

    try {
      // Step 1: Call the RPC to build the snapshot and soft-delete attendance
      const { data, error } = await supabase.rpc('archive_academic_year', {
        p_school_id: schoolId,
        p_year: selectedYear,
      });

      if (error) throw new Error(error.message);
      if (data?.status === 'error') throw new Error(data.message);

      // Step 2: Upload the snapshot JSON to Supabase Storage
      const snapshotBlob = new Blob(
        [JSON.stringify(data.snapshot, null, 2)],
        { type: 'application/json' }
      );

      const { error: uploadError } = await supabase.storage
        .from('academic-archives')
        .upload(data.storage_path, snapshotBlob, {
          contentType: 'application/json',
          upsert: false,
        });

      if (uploadError) {
        // Storage upload failed — the RPC already soft-deleted rows and inserted
        // the tracking record. This is a recoverable state.
        throw new Error(
          `Archive saved in database but storage upload failed: ${uploadError.message}. ` +
          `Please contact support or retry the download manually.`
        );
      }

      setResult({
        type: 'success',
        message: data.message,
        storagePath: data.storage_path,
        rowCounts: data.row_counts,
        studentCount: data.student_count,
      });
      setSelectedYear('');
      fetchArchives();

    } catch (err) {
      setResult({ type: 'error', message: err.message });
    } finally {
      setArchiving(false);
    }
  }

  async function handleDownload(archive) {
    try {
      const { data, error } = await supabase.storage
        .from('academic-archives')
        .createSignedUrl(archive.storage_path, 300); // 5-minute signed URL

      if (error) throw new Error(error.message);
      if (!data?.signedUrl) throw new Error('Could not generate download link.');

      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = `${schoolSettings?.name || 'school'}_${archive.academic_year}_archive.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      alert('Download failed: ' + err.message);
    }
  }

  async function handlePurge(archive) {
    if (!window.confirm(
      `⚠️ PERMANENT PURGE — Academic Year ${archive.academic_year}\n\n` +
      `This will PERMANENTLY DELETE ${archive.row_counts?.attendance || 0} attendance records ` +
      `for ${archive.student_count || 0} students from the live database.\n\n` +
      `Before proceeding, confirm:\n` +
      `✅ You have downloaded and verified the archive file\n` +
      `✅ You understand this action is IRREVERSIBLE\n\n` +
      `Type "PURGE" in the next prompt to confirm.`
    )) return;

    const confirm2 = window.prompt('Type PURGE to confirm permanent deletion:');
    if (confirm2 !== 'PURGE') {
      alert('Purge cancelled. You must type exactly "PURGE" to confirm.');
      return;
    }

    setPurging(archive.academic_year);
    try {
      const { data, error } = await supabase.rpc('purge_archived_attendance', {
        p_school_id: schoolId,
        p_year: archive.academic_year,
      });

      if (error) throw new Error(error.message);
      if (data?.status === 'error') throw new Error(data.message);

      alert(`✅ ${data.message}`);
      fetchArchives();
    } catch (err) {
      alert('Purge failed: ' + err.message);
    } finally {
      setPurging(null);
    }
  }

  const formatBytes = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl">
        <div className="p-2.5 bg-indigo-500/15 text-indigo-400 rounded-xl flex-shrink-0">
          <Archive size={20} />
        </div>
        <div>
          <h4 className="text-sm font-black text-slate-200 uppercase tracking-widest mb-1">
            Academic Year Archival Console
          </h4>
          <p className="text-xs text-slate-400 leading-relaxed">
            Archive a past year's attendance, achievements, and leave records into a secure
            offline snapshot. Frees live database storage while preserving full data history.
          </p>
        </div>
      </div>

      {/* ── Info Banner ───────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
        <Info size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-amber-300/80 leading-relaxed font-medium">
          <strong>Two-Step Process:</strong> Archiving soft-deletes data (data remains readable).
          Only after you download and verify the archive file should you run the permanent <strong>Purge</strong>.
          Purge is irreversible.
        </p>
      </div>

      {/* ── Archive Action Card ───────────────────────────────────────── */}
      <div className="p-5 bg-slate-800/40 border border-white/5 rounded-2xl space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Calendar size={14} className="text-indigo-400" />
          <span className="text-xs font-black text-slate-300 uppercase tracking-widest">
            Archive an Academic Year
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Year selector */}
          <div className="relative flex-1">
            <select
              value={selectedYear}
              onChange={(e) => { setSelectedYear(e.target.value); setResult(null); }}
              className="sp-input w-full pr-9 appearance-none bg-slate-800/60"
              disabled={archiving}
            >
              <option value="">Select academic year to archive...</option>
              {archivableYears.map(year => {
                const alreadyArchived = archives.some(a => a.academic_year === year);
                return (
                  <option key={year} value={year} disabled={alreadyArchived}>
                    {year} {alreadyArchived ? '(Already Archived)' : ''}
                  </option>
                );
              })}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>

          {/* Archive button */}
          <button
            onClick={handleArchive}
            disabled={!selectedYear || archiving}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all"
          >
            {archiving ? (
              <><Loader2 size={14} className="animate-spin" /> Archiving...</>
            ) : (
              <><Archive size={14} /> Archive Year</>
            )}
          </button>
        </div>

        {/* Result feedback */}
        {result && (
          <div className={`flex items-start gap-3 p-3 rounded-xl text-xs font-semibold leading-relaxed border ${
            result.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-red-500/10 border-red-500/20 text-red-300'
          }`}>
            {result.type === 'success'
              ? <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
              : <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            }
            <div>
              <p>{result.message}</p>
              {result.type === 'success' && result.rowCounts && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(result.rowCounts).map(([table, count]) => (
                    <span key={table} className="bg-emerald-500/20 text-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-black uppercase">
                      {table}: {count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Archive History ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <HardDrive size={14} className="text-slate-500" />
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
            Archive History
          </span>
        </div>

        {loadingArchives ? (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : archives.length === 0 ? (
          <div className="text-center py-8 bg-slate-800/20 border border-white/5 rounded-xl">
            <Archive size={28} className="text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-medium">No archives yet. Archive a past year above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {archives.map(archive => (
              <div
                key={archive.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-800/40 border border-white/5 hover:border-indigo-500/20 rounded-xl transition-all"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Year badge */}
                  <div className="flex-shrink-0 w-14 h-14 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex flex-col items-center justify-center">
                    <span className="text-xs font-black text-indigo-400 leading-none">{archive.academic_year}</span>
                    <span className="text-[8px] text-indigo-300/60 uppercase tracking-wider mt-0.5">Year</span>
                  </div>

                  {/* Details */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-200">
                        Academic Year {archive.academic_year}
                      </span>
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        archive.status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {archive.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      <span className="text-[10px] text-slate-500">
                        📅 Archived {new Date(archive.archived_at).toLocaleDateString()}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        👤 {archive.student_count || 0} students
                      </span>
                      <span className="text-[10px] text-slate-500">
                        💾 {formatBytes(archive.snapshot_size_bytes)}
                      </span>
                      {archive.row_counts && (
                        <span className="text-[10px] text-slate-500">
                          📋 {archive.row_counts.attendance || 0} attendance rows
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  {/* Download */}
                  <button
                    onClick={() => handleDownload(archive)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
                    title="Download archive JSON"
                  >
                    <Download size={12} /> Download
                  </button>

                  {/* Purge */}
                  <button
                    onClick={() => handlePurge(archive)}
                    disabled={purging === archive.academic_year}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all disabled:opacity-50"
                    title="Permanently delete archived rows from live database"
                  >
                    {purging === archive.academic_year
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Trash2 size={12} />
                    }
                    Purge
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Security Note ─────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-3 bg-slate-800/20 border border-white/5 rounded-xl">
        <Shield size={12} className="text-slate-600 mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-slate-600 leading-relaxed">
          Archive files are stored in a private Supabase Storage bucket (academic-archives).
          Only school admins can access them via time-limited signed URLs. Files are never
          publicly accessible.
        </p>
      </div>
    </div>
  );
}
