import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { usePending } from '../../hooks/usePending';
import UserAvatar from '../../components/UserAvatar';
import {
  Users, Search, UserPlus, Filter, Loader2, Phone, BookOpen,
  CreditCard, X, Save, Calendar, Droplet, MapPin, GraduationCap, BadgeInfo, Lock, Bus, Plus, Trash2,
  Upload, Download, CheckCircle2, AlertTriangle, FileSpreadsheet, Play, Check, AlertCircle, Layers
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const normalizeClassForMatching = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/\b(class|grade|std|standard|sec|section|group)\b/g, '') // remove common prefixes/words
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, '$1')                        // remove ordinal suffixes
    .replace(/[^a-z0-9]/g, '')                                       // remove non-alphanumeric
    .trim();
};

const formatClassName = (input) => {
  let str = input.trim().toUpperCase();
  if (!str) return '';

  const getOrdinal = (n) => {
    const num = parseInt(n, 10);
    const j = num % 10, k = num % 100;
    if (j === 1 && k !== 11) return 'ST';
    if (j === 2 && k !== 12) return 'ND';
    if (j === 3 && k !== 13) return 'RD';
    return 'TH';
  };

  if (/^\d+$/.test(str)) {
    return str + getOrdinal(str);
  }
  if (/^\d+[A-Z]$/.test(str)) {
    return str + '-TH';
  }
  if (/^\d+\s+[A-Z]$/.test(str)) {
    return str.replace(/\s+/g, '') + '-TH';
  }
  str = str.replace(/\b(\d+)\b/g, (match) => {
    return match + getOrdinal(match);
  });
  return str;
};

async function triggerDownload(blob, filename) {
  if (Capacitor.isNativePlatform()) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array  = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < uint8Array.byteLength; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64Data = btoa(binary);

      const writeResult = await Filesystem.writeFile({
        path:      filename,
        data:      base64Data,
        directory: Directory.Cache,
        recursive: true
      });

      await Share.share({
        title:      filename,
        url:        writeResult.uri,
        dialogTitle: `Open or save ${filename}`,
      });
    } catch (err) {
      console.error("Native download error", err);
      alert("Failed to download file: " + (err.message || err));
    }
  } else {
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

const EField = ({ label, field, type = 'text', options = null, allowCustom = false, editForm, setEditForm }) => (
  <div>
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">{label}</label>
    {options && !allowCustom ? (
      <select
        value={editForm[field] || ''}
        onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300 leading-normal"
      >
        <option value="">{label}...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <>
        <input
          type={type}
          list={options ? field + "-datalist" : undefined}
          value={editForm[field] || ''}
          onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300 leading-normal"
        />
        {options && allowCustom && (
          <datalist id={field + "-datalist"}>
            {options.map(o => <option key={o} value={o} />)}
          </datalist>
        )}
      </>
    )}
  </div>
);

// Global UserAvatar component is imported above

export default function UserManagement() {
  const { schoolSettings, setSchoolSettings, user: currentUser, role: currentRole, platformSettings } = useAppStore();
  const { isPending } = usePending();
  const [activeTab, setActiveTab] = useState(currentRole === 'teacher' ? 'student' : 'teacher');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState(currentRole === 'teacher' ? (currentUser?.class || '') : '');
  const [page, setPage] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    setPage(0);
  }, [activeTab, searchTerm, selectedClass]);

  /* ── Create Class & Manage Sections Modal State ── */
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [newClassInput, setNewClassInput] = useState('');
  const [isManageSectionsModalOpen, setIsManageSectionsModalOpen] = useState(false);
  const [sectionClassSelect, setSectionClassSelect] = useState('');
  const [newSectionInput, setNewSectionInput] = useState('');
  const queryClient = useQueryClient();

  /* ── Password Reset State ── */
  const [resettingUser, setResettingUser] = useState(null);
  const [newPass, setNewPass] = useState('');
  const [showDemoModal, setShowDemoModal] = useState(false);

  /* ── Add User Modal State ── */
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [downloadedCredentials, setDownloadedCredentials] = useState(false);
  const [downloadedFailures, setDownloadedFailures] = useState(false);
  const [bulkStep, setBulkStep] = useState(1);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkHeaders, setBulkHeaders] = useState([]);
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkMappings, setBulkMappings] = useState({});
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkResults, setBulkResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [addForm, setAddForm] = useState({
    email: '', username: '', name: '', password: '', contact: '',
    userClass: '', dob: '', bloodGroup: '', address: '',
    designation: '', qualification: '', rollNumber: '',
  });
  // Bus allocation for new driver (only visible when activeTab === 'driver')
  const [busAlloc, setBusAlloc] = useState({ mode: 'existing', existingBusId: '', newBusNumber: '', newRouteName: '' });

  /* ── Bulk Upload Helper Functions ── */
  const getTargetFieldsForRole = (role) => {
    const common = [
      { key: 'name', label: 'Full Name *', required: true },
      { key: 'email', label: 'Email', required: false },
      { key: 'username', label: 'Username', required: false },
      { key: 'password', label: 'Password', required: false },
      { key: 'contact', label: 'Contact Number', required: false },
      { key: 'dob', label: 'Date of Birth (YYYY-MM-DD)', required: false },
      { key: 'bloodGroup', label: 'Blood Group', required: false },
      { key: 'address', label: 'Address', required: false }
    ];

    if (role === 'student') {
      return [
        ...common.slice(0, 1),
        { key: 'userClass', label: 'Class *', required: true },
        { key: 'section', label: 'Section / Sub-Class', required: false },
        { key: 'rollNumber', label: 'Roll Number', required: false },
        ...common.slice(1)
      ];
    } else if (role === 'teacher' || role === 'staff') {
      return [
        ...common,
        { key: 'designation', label: 'Designation', required: false },
        { key: 'qualification', label: 'Qualification', required: false }
      ];
    }
    return common; // driver
  };

  const findHeuristicMatch = (key, fileHeaders) => {
    const synonyms = {
      name: ['name', 'full name', 'student name', 'name of student', 'teacher name', 'driver name', 'staff name', 'full_name', 'student_name'],
      userClass: ['class', 'grade', 'standard', 'class/section', 'class *', 'class/section *'],
      section: ['section', 'sec', 'sub class', 'subclass', 'section/subclass', 'sec *'],
      email: ['email', 'email id', 'email address', 'email_id', 'mail'],
      username: ['username', 'user name', 'admission number', 'admission no', 'national id', 'student national id', 'pen'],
      rollNumber: ['roll number', 'roll no', 'roll_number', 'roll_no'],
      password: ['password', 'pwd'],
      contact: ['contact', 'phone', 'mobile', 'contact number', 'phone number', 'mobile number', 'mobile no', 'mobile no.'],
      dob: ['dob', 'date of birth', 'birth date', 'date of birth (dob)'],
      bloodGroup: ['blood group', 'blood_group', 'bg'],
      designation: ['designation', 'role name'],
      qualification: ['qualification']
    };

    const targets = synonyms[key] || [key];
    return fileHeaders.find(header => 
      targets.some(target => header.toLowerCase().includes(target.toLowerCase()))
    );
  };

  const handleDownloadTemplate = async () => {
    let headers = [];
    if (activeTab === 'student') {
      headers = ['Full Name *', 'Class *', 'Roll Number', 'Email', 'Username', 'Password', 'Contact', 'DOB (YYYY-MM-DD)', 'Blood Group', 'Address'];
    } else if (activeTab === 'teacher' || activeTab === 'staff') {
      headers = ['Full Name *', 'Email', 'Username', 'Password', 'Contact', 'DOB (YYYY-MM-DD)', 'Blood Group', 'Address', 'Designation', 'Qualification'];
    } else if (activeTab === 'driver') {
      headers = ['Full Name *', 'Email', 'Username', 'Password', 'Contact', 'DOB (YYYY-MM-DD)', 'Blood Group', 'Address'];
    }

    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    const wbBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await triggerDownload(blob, `${activeTab}_bulk_upload_template.xlsx`);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        
        if (data.length === 0) {
          alert("The uploaded file is empty.");
          return;
        }

        const headers = data[0].map(h => String(h || '').trim()).filter(Boolean);
        const rows = data.slice(1).filter(r => r && r.some(cell => cell !== null && cell !== ''));

        if (headers.length === 0) {
          alert("No column headers detected in the file.");
          return;
        }

        // Heuristics mapping
        const detectedMappings = {};
        const targetFields = getTargetFieldsForRole(activeTab);

        targetFields.forEach(field => {
          const match = findHeuristicMatch(field.key, headers);
          detectedMappings[field.key] = match || "";
        });

        setBulkFile(file);
        setBulkHeaders(headers);
        setBulkRows(rows);
        setBulkMappings(detectedMappings);
        setBulkStep(2);
      } catch (err) {
        alert("Failed to parse file: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleStartImport = async () => {
    setIsProcessing(true);
    setBulkStep(3);
    setBulkProgress(0);
    setDownloadedCredentials(false);
    setDownloadedFailures(false);

    let dbStudents = [];
    if (activeTab === 'student') {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('name, class')
          .eq('school_id', schoolSettings.school_id)
          .eq('role', 'student');
        if (error) throw error;
        dbStudents = data || [];
      } catch (err) {
        console.error("Failed to load existing students for duplicate check:", err);
      }
    }

    const targetFields = getTargetFieldsForRole(activeTab);
    const processedRows = [];
    const initialFailures = [];
    const seenInSheet = new Set();
    const normalizeStr = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

    // Pre-validate rows and extract values client-side
    bulkRows.forEach((row, rowIndex) => {
      const rowNum = rowIndex + 2; // header is row 1
      const payload = {};
      let hasError = false;
      const errorReasons = [];

      targetFields.forEach(field => {
        const fileColName = bulkMappings[field.key];
        const colIndex = bulkHeaders.indexOf(fileColName);
        let val = colIndex !== -1 ? row[colIndex] : undefined;
        
        // clean value
        if (val === null || val === undefined) {
          val = "";
        } else {
          val = String(val).trim();
        }

        payload[field.key] = val;
      });

      // Validation 1: Full Name is required
      if (!payload.name) {
        hasError = true;
        errorReasons.push("Full Name is required");
      }

      // Validation 2: Class is required for students, must match classes list
      if (activeTab === 'student') {
        if (!payload.userClass) {
          hasError = true;
          errorReasons.push("Class is required");
        } else {
          // If section/sub-class is provided separately in CSV (e.g. Class: 5, Section: A)
          if (payload.section && payload.section.trim() && !payload.userClass.includes('-')) {
            const candidateWithSec = `${payload.userClass.trim()} - ${payload.section.trim().toUpperCase()}`;
            const candidateNorm = normalizeClassForMatching(candidateWithSec);
            const matchedSecClass = classes.find(c => normalizeClassForMatching(c) === candidateNorm);
            if (matchedSecClass) {
              payload.userClass = matchedSecClass;
            }
          }

          // Smart fuzzy matching of classes (ignoring prefixes, suffixes, and spaces)
          const normExcel = normalizeClassForMatching(payload.userClass);
          const matchedClass = classes.find(c => normalizeClassForMatching(c) === normExcel);
          
          if (!matchedClass) {
            hasError = true;
            errorReasons.push(`Class "${payload.userClass}" is invalid (does not exist in school settings)`);
          } else {
            payload.userClass = matchedClass;
          }
        }

        // Duplicate checks
        if (payload.name && payload.userClass) {
          const normName = normalizeStr(payload.name);
          const normClass = normalizeStr(payload.userClass);
          
          const isDbDuplicate = dbStudents.some(
            s => normalizeStr(s.name) === normName && normalizeStr(s.class) === normClass
          );
          if (isDbDuplicate) {
            hasError = true;
            errorReasons.push(`Duplicate: Student "${payload.name}" already exists in Class "${payload.userClass}"`);
          }

          const sheetKey = `${normName}|${normClass}`;
          if (seenInSheet.has(sheetKey)) {
            hasError = true;
            errorReasons.push(`Duplicate: Student "${payload.name}" is listed multiple times in this Excel file for Class "${payload.userClass}"`);
          } else if (!hasError) {
            seenInSheet.add(sheetKey);
          }
        }
      }

      // Format DOB if present
      if (payload.dob) {
        const d = new Date(payload.dob);
        if (isNaN(d.getTime())) {
          payload.dob = null;
        } else {
          payload.dob = d.toISOString().split('T')[0];
        }
      } else {
        payload.dob = null;
      }

      // Auto-generate username if blank
      let isUsernameAutogenerated = false;
      if (!payload.username) {
        isUsernameAutogenerated = true;
        const cleanName = payload.name ? payload.name.toLowerCase().replace(/[^a-z0-9]/g, '') : 'user';
        const randomVal = Math.floor(1000 + Math.random() * 9000);
        payload.username = `${cleanName}${randomVal}`;
      }

      // Auto-generate password if blank
      if (!payload.password) {
        payload.password = 'School@123';
      }

      // Auto-generate email if blank
      let isDummyEmail = false;
      if (!payload.email) {
        isDummyEmail = true;
        payload.email = `${payload.username.toLowerCase()}@${schoolSettings.school_code.toLowerCase()}.schoolos.com`;
      } else {
        // validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(payload.email)) {
          hasError = true;
          errorReasons.push(`Invalid email format: "${payload.email}"`);
        }
      }

      if (hasError) {
        initialFailures.push({
          rowNum,
          name: payload.name || "Unknown",
          rawRowData: row,
          reason: errorReasons.join(", ")
        });
      } else {
        processedRows.push({
          rowNum,
          payload,
          isDummyEmail,
          rawRowData: row
        });
      }
    });

    const successList = [];
    const failureList = [...initialFailures];
    let processedCount = 0;
    const totalToProcess = processedRows.length;

    const runBatch = async (batch) => {
      await Promise.all(batch.map(async (row) => {
        try {
          // Resolve username uniqueness strictly at the school level (up to 5 retries)
          let finalUsername = row.payload.username;
          let isUnique = false;
          let attempts = 0;

          while (!isUnique && attempts < 5) {
            const checkUsername = attempts === 0 ? finalUsername : `${finalUsername}${attempts}`;
            const { data: existingUser } = await supabase
              .from('users')
              .select('id')
              .eq('school_id', schoolSettings.school_id)
              .eq('username', checkUsername)
              .maybeSingle();

            if (!existingUser) {
              finalUsername = checkUsername;
              isUnique = true;
            } else {
              attempts++;
            }
          }

          if (!isUnique) {
            throw new Error(`Username conflict could not be resolved at the school level.`);
          }

          row.payload.username = finalUsername;

          // If dummy email was built from username, update it
          if (row.isDummyEmail) {
            row.payload.email = `${finalUsername}@${schoolSettings.school_code.toLowerCase()}.schoolos.com`;
          }

          // Call SQL RPC (No Aadhar parameters)
          const { data: newUid, error: rpcError } = await supabase.rpc('admin_create_user', {
            p_email: row.payload.email,
            p_password: row.payload.password,
            p_role: activeTab === 'staff' ? 'staff' : activeTab,
            p_name: row.payload.name,
            p_username: row.payload.username,
            p_school_id: schoolSettings.school_id,
            p_class: row.payload.userClass || null,
            p_contact: row.payload.contact || null,
            p_dob: row.payload.dob || null,
            p_address: row.payload.address || null,
            p_blood_group: row.payload.bloodGroup || null,
            p_designation: row.payload.designation || null,
            p_qualification: row.payload.qualification || null,
            p_roll_number: row.payload.rollNumber || null
          });

          if (rpcError) throw rpcError;

          // Trigger Welcome Email Edge Function (skip for students)
          if (activeTab !== 'student' && row.payload.email) {
            supabase.functions.invoke('send-welcome-email', {
              body: {
                email: row.payload.email,
                name: row.payload.name,
                username: row.payload.username,
                password: row.payload.password,
                role: activeTab === 'staff' ? 'staff' : activeTab,
                schoolName: schoolSettings.name
              }
            }).catch(err => console.error('Failed to trigger welcome email:', err));
          }

          successList.push({
            rowNum: row.rowNum,
            name: row.payload.name,
            class: row.payload.userClass || 'N/A',
            username: row.payload.username,
            password: row.payload.password,
            email: row.payload.email
          });
        } catch (err) {
          failureList.push({
            rowNum: row.rowNum,
            name: row.payload.name || "Unknown",
            rawRowData: row.rawRowData,
            reason: err.message || "Database error occurred"
          });
        } finally {
          processedCount++;
          if (totalToProcess > 0) {
            setBulkProgress(Math.round((processedCount / totalToProcess) * 100));
          }
        }
      }));
    };

    // Concurrency queue (3 concurrent requests, 300ms inter-batch delay)
    const concurrency = 3;
    const delayMs = 300;
    for (let i = 0; i < processedRows.length; i += concurrency) {
      const chunk = processedRows.slice(i, i + concurrency);
      await runBatch(chunk);
      if (i + concurrency < processedRows.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    setBulkResults({ successList, failureList });
    queryClient.invalidateQueries({ queryKey: ['users-list'] });
    setIsProcessing(false);
    setBulkStep(4);
  };

  const handleDownloadCredentials = async () => {
    if (!bulkResults?.successList) return;
    const headers = ['Name', 'Role/Class', 'Username', 'Password', 'Email'];
    const rows = bulkResults.successList.map(s => [
      s.name,
      activeTab === 'student' ? s.class : (activeTab.charAt(0).toUpperCase() + activeTab.slice(1)),
      s.username,
      s.password,
      s.email
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Credentials");
    const wbBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await triggerDownload(blob, `${activeTab}_imported_credentials.xlsx`);
    setDownloadedCredentials(true);
  };

  const handleDownloadFailures = async () => {
    if (!bulkResults?.failureList) return;
    const headers = [...bulkHeaders, 'Error Reason'];
    const rows = bulkResults.failureList.map(f => {
      const dataRow = [...f.rawRowData];
      while (dataRow.length < bulkHeaders.length) {
        dataRow.push('');
      }
      dataRow.push(f.reason);
      return dataRow;
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Failed Rows");
    const wbBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await triggerDownload(blob, `${activeTab}_failed_records.xlsx`);
    setDownloadedFailures(true);
  };

  const resetBulkUploadState = () => {
    if (bulkResults) {
      const hasUnsavedCredentials = (bulkResults.successList?.length > 0) && !downloadedCredentials;
      const hasUnsavedFailures = (bulkResults.failureList?.length > 0) && !downloadedFailures;
      
      if (hasUnsavedCredentials || hasUnsavedFailures) {
        const confirmed = window.confirm("Please download your credentials and error logs before closing. Are you sure you want to proceed?");
        if (!confirmed) return;
      }
    }

    setBulkStep(1);
    setBulkFile(null);
    setBulkHeaders([]);
    setBulkRows([]);
    setBulkMappings({});
    setBulkProgress(0);
    setBulkResults(null);
    setIsProcessing(false);
    setIsBulkModalOpen(false);
    setDownloadedCredentials(false);
    setDownloadedFailures(false);
  };

  /* ── Edit Profile Panel State ── */
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});

  const classes = schoolSettings?.classes || [];

  useEffect(() => {
    if (isAddModalOpen || isBulkModalOpen || editingUser || isCreateClassModalOpen || resettingUser) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isAddModalOpen, isBulkModalOpen, editingUser, isCreateClassModalOpen, resettingUser]);

  /* ── Fetch existing bus assignments for the Bus Allocation dropdown ── */
  const { data: existingBuses = [] } = useQuery({
    queryKey: ['bus-assignments-admin', schoolSettings?.school_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('bus_assignments')
        .select('id, bus_number, route_name, driver_id')
        .eq('school_id', schoolSettings.school_id)
        .eq('is_active', true)
        .order('bus_number', { ascending: true });
      return data || [];
    },
    enabled: !!schoolSettings?.school_id && activeTab === 'driver',
  });

  /* ── Data Fetching ── */
  const { data, isLoading } = useQuery({
    queryKey: ['users-list', activeTab, schoolSettings?.school_id, page, searchTerm, selectedClass],
    queryFn: async () => {
      let q = supabase.from('users').select('*', { count: 'exact' });
      q = q.eq('school_id', schoolSettings.school_id);

      if (activeTab === 'staff') {
        q = q.eq('role', 'staff');
      } else {
        q = q.eq('role', activeTab);
      }

      if (activeTab === 'student' && selectedClass) {
        q = q.eq('class', selectedClass);
      }

      if (searchTerm.trim()) {
        const term = `%${searchTerm.trim()}%`;
        q = q.or(`name.ilike.${term},username.ilike.${term}`);
      }

      q = q.order('name');

      const from = page * pageSize;
      const to = from + pageSize - 1;
      q = q.range(from, to);

      const { data: resData, count, error } = await q;
      if (error) throw error;
      return { users: resData || [], totalCount: count || 0 };
    },
    enabled: !!schoolSettings?.school_id,
  });

  const usersList = data?.users || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  /* ── Student Addition Requests Query & Handlers (Teacher approval flow) ── */
  const { data: studentRequests = [], refetch: refetchRequests } = useQuery({
    queryKey: ['student-addition-requests', schoolSettings?.school_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_addition_requests')
        .select(`
          id,
          status,
          student_details,
          created_at,
          teacher:teacher_id (name)
        `)
        .eq('school_id', schoolSettings.school_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!schoolSettings?.school_id && currentRole === 'admin',
  });

  const handleApproveStudentRequest = async (req) => {
    if (!window.confirm(`Are you sure you want to approve and create student "${req.student_details?.name}"?`)) return;

    try {
      const details = req.student_details;

      // 1. Create the user using admin_create_user RPC
      const { data: newUid, error: createError } = await supabase.rpc('admin_create_user', {
        p_email: details.email || `${details.username?.toLowerCase() || 'student'}@${schoolSettings?.school_code?.toLowerCase()}.schoolos.com`,
        p_password: details.password || 'School@123',
        p_role: 'student',
        p_name: details.name,
        p_username: details.username,
        p_school_id: schoolSettings.school_id,
        p_class: details.userClass || null,
        p_contact: details.contact || null,
        p_dob: details.dob || null,
        p_address: details.address || null,
        p_blood_group: details.bloodGroup || null,
        p_designation: null,
        p_qualification: null,
        p_roll_number: details.rollNumber || null
      });

      if (createError) throw createError;

      // 2. Mark request as approved
      const { error: updateError } = await supabase
        .from('student_addition_requests')
        .update({ status: 'approved' })
        .eq('id', req.id);

      if (updateError) throw updateError;

      // 3. Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      queryClient.invalidateQueries({ queryKey: ['student-addition-requests'] });
      alert('Student approved and created successfully!');
    } catch (err) {
      alert('Error approving request: ' + err.message);
    }
  };

  const handleRejectStudentRequest = async (requestId) => {
    if (!window.confirm('Are you sure you want to reject this request?')) return;

    try {
      const { error } = await supabase
        .from('student_addition_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['student-addition-requests'] });
      alert('Request rejected successfully.');
    } catch (err) {
      alert('Error rejecting request: ' + err.message);
    }
  };

  /* ── Mutations ── */
  const createUserMutation = useMutation({
    mutationFn: async () => {
      const f = addForm;
      const finalEmail = f.email?.trim() || `${f.username?.toLowerCase() || 'user'}@${schoolSettings?.school_code?.toLowerCase()}.schoolos.com`;
      if (currentRole === 'teacher') {
        const { data, error } = await supabase.from('student_addition_requests').insert({
          school_id: schoolSettings.school_id,
          teacher_id: currentUser.id,
          student_details: {
            email: finalEmail,
            password: f.password,
            role: 'student',
            name: f.name,
            username: f.username,
            userClass: currentUser.class || '', // strictly locked/restricted to teacher's class
            contact: f.contact || '',
            dob: f.dob || null,
            bloodGroup: f.bloodGroup || '',
            address: f.address || '',
            rollNumber: f.rollNumber || '',
          },
          status: 'pending'
        }).select('id').single();

        if (error) throw error;
        return { isRequest: true, id: data?.id };
      } else {
        const { data, error } = await supabase.rpc('admin_create_user', {
          p_email: finalEmail, p_password: f.password,
          p_role: activeTab === 'staff' ? 'staff' : activeTab,
          p_name: f.name, p_username: f.username,
          p_school_id: schoolSettings.school_id,
          p_class: f.userClass || null, p_contact: f.contact || null,
          p_dob: f.dob || null, p_address: f.address || null,
          p_blood_group: f.bloodGroup || null,
          p_designation: f.designation || null,
          p_qualification: f.qualification || null,
          p_roll_number: f.rollNumber || null,
        });
        if (error) throw error;

        // If adding a driver and bus allocation is requested, save to bus_assignments
        if (activeTab === 'driver' && data) {
          const newDriverId = data; // RPC returns the new user's UUID
          const busNumber = busAlloc.mode === 'new'
            ? busAlloc.newBusNumber.trim()
            : existingBuses.find(b => b.id === busAlloc.existingBusId)?.bus_number;

          if (busNumber) {
            if (busAlloc.mode === 'new') {
              // Insert a brand new bus assignment
              await supabase.from('bus_assignments').insert({
                school_id:   schoolSettings.school_id,
                bus_number:  busNumber,
                route_name:  busAlloc.newRouteName.trim() || null,
                driver_id:   newDriverId,
                driver_name: f.name || f.email,
                is_active:   true,
              });
            } else {
              // Update existing bus assignment to point to new driver
              await supabase
                .from('bus_assignments')
                .update({ driver_id: newDriverId, driver_name: f.name || f.email })
                .eq('id', busAlloc.existingBusId);
            }
          }
        }

        return {
          id: data,
          email: f.email,
          username: f.username,
          name: f.name,
          password: f.password,
          role: activeTab === 'staff' ? 'staff' : activeTab
        };
      }
    },
    onSuccess: (createdUser) => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      queryClient.invalidateQueries({ queryKey: ['bus-assignments-admin'] });
      queryClient.invalidateQueries({ queryKey: ['student-addition-requests'] });
      setIsAddModalOpen(false);

      if (createdUser?.isRequest) {
        alert('Student request submitted successfully for Admin approval!');
      } else {
        // Trigger welcome email Deno Edge Function if NOT a student
        if (createdUser && createdUser.role !== 'student' && createdUser.email) {
          supabase.functions.invoke('send-welcome-email', {
            body: {
              email: createdUser.email,
              name: createdUser.name,
              username: createdUser.username,
              password: createdUser.password,
              role: createdUser.role,
              schoolName: schoolSettings.name
            }
          }).catch(err => {
            console.error('Failed to trigger welcome email:', err);
          });
        }
        alert('User created successfully!');
      }

      setAddForm({ email: '', username: '', name: '', password: '', contact: '', userClass: '', dob: '', bloodGroup: '', address: '', designation: '', qualification: '', rollNumber: '' });
      setBusAlloc({ mode: 'existing', existingBusId: '', newBusNumber: '', newRouteName: '' });
    },
    onError: (err) => alert('Error: ' + err.message),
  });

  const updateUserMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_update_user', {
        p_user_id: editingUser.id,
        p_email: editForm.email,
        p_username: editForm.username,
        p_name: editForm.name,
        p_role: editingUser.role,
        p_class: editForm.class || null,
        p_contact: editForm.contact || null,
        p_dob: editForm.dob || null,
        p_address: editForm.address || null,
        p_blood_group: editForm.blood_group || null,
        p_qualification: editForm.qualification || null,
        p_designation: editForm.designation || null,
        p_roll_number: editForm.roll_number || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setEditingUser(null);
      alert('Profile updated successfully!');
    },
    onError: (err) => alert('Error: ' + err.message),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId) => {
      const { error } = await supabase.rpc('admin_delete_user', {
        p_user_id: userId
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-list'] });
      setEditingUser(null);
      alert('User deleted successfully!');
    },
    onError: (err) => alert('Error: ' + err.message),
  });
  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-reset-password', {
        body: { targetUserId: resettingUser.id, newPassword: newPass }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setResettingUser(null);
      setNewPass('');
      alert('Password reset successfully!');
    },
    onError: (err) => alert('Error resetting password: ' + err.message),
  });

  const openEditPanel = (user) => {
    if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
    setEditingUser(user);
    setEditForm({ ...user });
  };

  const handleSaveClass = async (e) => {
    e.preventDefault();
    if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
    if (!newClassInput || !newClassInput.trim()) {
      alert('Please enter a class number.');
      return;
    }
    
    const getOrdinal = (n) => {
      const num = parseInt(n, 10);
      if (isNaN(num)) return '';
      const j = num % 10, k = num % 100;
      if (j === 1 && k !== 11) return 'ST';
      if (j === 2 && k !== 12) return 'ND';
      if (j === 3 && k !== 13) return 'RD';
      return 'TH';
    };
    
    const formatted = newClassInput.trim() + getOrdinal(newClassInput.trim());
    
    if (classes.includes(formatted)) {
      alert('Already exists');
      return;
    }
    
    const updatedClasses = [...classes, formatted].sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
    
    const { error } = await supabase.from('school_settings').update({ classes: updatedClasses }).eq('school_id', schoolSettings.school_id);
    if (error) return alert('Error creating class: ' + error.message);
    setSchoolSettings({ ...schoolSettings, classes: updatedClasses });
    alert(`Class ${formatted} created successfully!`);
    setIsCreateClassModalOpen(false);
    setNewClassInput('');
  };

  const handleSaveSection = async (e) => {
    e.preventDefault();
    if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
    if (!sectionClassSelect || !newSectionInput.trim()) {
      alert('Please select a base class and enter a section name (e.g. A, B, C).');
      return;
    }
    const cleanSection = newSectionInput.trim().toUpperCase();
    const formattedSubClass = `${sectionClassSelect} - ${cleanSection}`;
    
    if (classes.includes(formattedSubClass)) {
      alert(`Sub-Class ${formattedSubClass} already exists!`);
      return;
    }
    
    const updatedClasses = [...classes, formattedSubClass].sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
    
    const { error } = await supabase.from('school_settings').update({ classes: updatedClasses }).eq('school_id', schoolSettings.school_id);
    if (error) return alert('Error saving section: ' + error.message);
    setSchoolSettings({ ...schoolSettings, classes: updatedClasses });
    alert(`Sub-Class ${formattedSubClass} created successfully!`);
    setNewSectionInput('');
  };

  const handleDeleteSubClass = async (className) => {
    // Block class/section deletion for Demo School 100
    const code = String(schoolSettings?.school_code || '').trim();
    const isDemoAndDisabled = code === '100' && !platformSettings?.allow_demo_edit;
    if (isDemoAndDisabled) {
      setShowDemoModal(true);
      return;
    }
    if (!window.confirm(`Are you sure you want to remove ${className}?`)) return;
    const updatedClasses = classes.filter(c => c !== className);
    const { error } = await supabase.from('school_settings').update({ classes: updatedClasses }).eq('school_id', schoolSettings.school_id);
    if (error) return alert('Error removing class: ' + error.message);
    setSchoolSettings({ ...schoolSettings, classes: updatedClasses });
  };


  return (
    <>
      <div className="space-y-6 animate-in fade-in duration-500">

      {/* Tab Switcher */}
      {currentRole === 'admin' && (
        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full sm:w-fit border border-slate-200 shadow-inner overflow-x-auto">
          {[
            ['teacher', 'Teachers', BookOpen],
            ['student', 'Students', Users],
            ['driver', 'Drivers', Bus],
            ['requests', 'New Student Requests', Users]
          ].map(([tab, label, Icon]) => {
            const isRequests = tab === 'requests';
            const count = isRequests ? studentRequests.length : 0;
            return (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSelectedClass(''); setEditingUser(null); }}
                className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab ? 'bg-white text-primary shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Icon size={18} /> 
                {label}
                {count > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black bg-rose-500 text-white rounded-full leading-none">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Control Bar */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-primary">
            <Search size={18} />
          </div>
          <input
            type="text"
            placeholder="Search by name or username..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="block w-full pl-11 pr-4 py-3.5 bg-white border border-border rounded-2xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm leading-normal"
          />
        </div>
        {activeTab === 'student' && (
          <div className="w-64 relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
              <Filter size={18} />
            </div>
            <select
              value={selectedClass}
              onChange={e => setSelectedClass(e.target.value)}
              className="block w-full pl-11 pr-4 py-3.5 bg-white border border-border rounded-2xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm appearance-none cursor-pointer font-semibold leading-normal"
            >
              <option value="">All Classes</option>
              {classes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        {currentRole === 'admin' && activeTab !== 'requests' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => {
                if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
                setIsCreateClassModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl shadow-lg shadow-emerald-500/20 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all whitespace-nowrap active:scale-95"
            >
              <Plus size={20} /> Create Class
            </button>
            <button
              onClick={() => {
                if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
                if (classes.length > 0 && !sectionClassSelect) setSectionClassSelect(classes[0]);
                setIsManageSectionsModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl shadow-lg shadow-teal-500/20 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 transition-all whitespace-nowrap active:scale-95"
            >
              <Layers size={20} /> Manage Sections
            </button>
            <button
              onClick={() => {
                if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
                setIsBulkModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl shadow-lg shadow-indigo-500/20 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all whitespace-nowrap active:scale-95"
            >
              <Upload size={20} /> Bulk Add {activeTab === 'staff' ? 'Staff' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1) + 's'}
            </button>
            <button
              onClick={() => {
                if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
                setIsAddModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl shadow-lg shadow-primary/20 text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-all whitespace-nowrap active:scale-95"
            >
              <UserPlus size={20} /> Add {activeTab === 'staff' ? 'Staff' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </button>
          </div>
        )}
        {currentRole === 'teacher' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => {
                if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
                setAddForm(f => ({ ...f, userClass: currentUser?.class || '' }));
                setIsAddModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl shadow-lg shadow-primary/20 text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-all whitespace-nowrap active:scale-95"
            >
              <UserPlus size={20} /> Add Student
            </button>
          </div>
        )}
      </div>

      {/* User Table */}
      <div className="bg-white border border-border rounded-3xl shadow-xl shadow-slate-200/50 overflow-hidden">
        {activeTab === 'requests' ? (
          studentRequests.length === 0 ? (
            <div className="text-center py-24">
              <p className="text-slate-500 font-medium">No pending student requests found.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="overflow-x-auto relative">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-border">
                      <th className="px-6 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Student Details</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Class</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">Requested By</th>
                      <th className="px-6 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {studentRequests.map((req) => {
                      const details = req.student_details || {};
                      return (
                        <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-6 py-5">
                            <div>
                              <div className="font-bold text-slate-800 text-base">{details.name}</div>
                              {details.email && <div className="text-xs font-semibold text-slate-400">{details.email}</div>}
                              {details.username && (
                                <div className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded inline-block mt-1">
                                  @{details.username}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-5 font-bold text-slate-700">{details.userClass || 'N/A'}</td>
                          <td className="px-6 py-5">
                            <div className="text-sm font-bold text-slate-800">{req.teacher?.name || 'Unknown Teacher'}</div>
                            <div className="text-[10px] text-slate-400 font-semibold">{new Date(req.created_at).toLocaleDateString()}</div>
                          </td>
                          <td className="px-6 py-5 text-right">
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => handleApproveStudentRequest(req)}
                                className="py-2 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-100 flex items-center gap-1"
                              >
                                <Check size={14} /> Accept
                              </button>
                              <button
                                onClick={() => handleRejectStudentRequest(req.id)}
                                className="py-2 px-4 bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-rose-100 flex items-center gap-1"
                              >
                                <X size={14} /> Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : isLoading ? (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="h-4 w-28 rounded-lg animate-shimmer"></div>
              <div className="h-4 w-36 rounded-lg animate-shimmer"></div>
              <div className="h-4 w-28 rounded-lg animate-shimmer"></div>
              <div className="h-4.5 w-20 rounded-lg animate-shimmer"></div>
            </div>
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full animate-shimmer shrink-0"></div>
                  <div className="space-y-2">
                    <div className="h-3.5 w-32 rounded animate-shimmer"></div>
                    <div className="h-2.5 w-20 rounded animate-shimmer"></div>
                  </div>
                </div>
                <div className="h-3.5 w-28 rounded animate-shimmer hidden md:block"></div>
                <div className="h-3.5 w-24 rounded animate-shimmer hidden md:block"></div>
                <div className="flex gap-2">
                  <div className="h-9 w-20 rounded-xl animate-shimmer"></div>
                  <div className="h-9 w-20 rounded-xl animate-shimmer"></div>
                </div>
              </div>
            ))}
          </div>
        ) : usersList.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-slate-500 font-medium">No {activeTab}s found.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="md:hidden flex items-center justify-end px-4 py-3 bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-black tracking-widest text-primary animate-pulse shadow-inner">
              Swipe left for more actions <span className="ml-2 text-sm">👉</span>
            </div>
            <div className="overflow-x-auto relative shadow-[inset_-12px_0_12px_-12px_rgba(0,0,0,0.1)]">
              <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
              <tr className="bg-slate-50/50 border-b border-border">
                  <th className="px-6 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">User Details</th>
                  {activeTab !== 'teacher' && (
                    <th className="px-6 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em]">
                      {activeTab === 'student' ? 'Class' : 'Designation'}
                    </th>
                  )}
                  <th className={`px-6 py-5 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] ${activeTab === 'teacher' ? 'text-left' : 'text-right'}`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <UserAvatar user={user} />
                        <div>
                          <div className="font-bold text-slate-800 text-base flex items-center gap-2">
                            {user.name}
                            {activeTab === 'teacher' && user.class && (
                              <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md uppercase tracking-widest">{user.class}</span>
                            )}
                          </div>
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-md inline-block mt-1">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    {activeTab !== 'teacher' && (
                      <td className="px-6 py-5">
                        <span className="font-bold text-slate-700 text-sm">
                          {activeTab === 'student' ? user.class : user.designation}
                          {!user.class && !user.designation && <span className="text-slate-400 dark:text-slate-500 italic text-xs">—</span>}
                        </span>
                      </td>
                    )}
                    <td className={`px-6 py-5 ${activeTab === 'teacher' ? 'text-left' : 'text-right'}`}>
                      <div className={`flex items-center gap-2 ${activeTab === 'teacher' ? 'justify-start' : 'justify-end'}`}>
                        {(currentRole === 'admin' || (currentRole === 'teacher' && activeTab === 'student')) && (
                          <button
                            onClick={() => {
                              if (isPending) { alert('Your application is currently under review. Data entry is disabled until your account is approved.'); return; }
                              setResettingUser(user);
                            }}
                            className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] font-black text-amber-600 hover:bg-amber-600 hover:text-white hover:border-amber-600 transition-all uppercase tracking-widest shadow-sm flex items-center gap-1.5"
                            title="Manage Password"
                          >
                            <Lock size={12} /> Manage Password
                          </button>
                        )}
                        <button
                          onClick={() => openEditPanel(user)}
                          className="px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-black text-indigo-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all uppercase tracking-widest shadow-sm"
                        >
                          Edit Profile
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="px-6 py-4 bg-slate-50 border-t border-border flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-500">
                Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, totalCount)} of {totalCount} entries
              </div>
              <div className="flex gap-2">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          </div>
        )}
      </div>
    </div>

    {/* ── EDIT PROFILE SIDE PANEL ── */}
      {editingUser && (
        <div className="fixed inset-0 z-[110] flex items-stretch sm:items-center justify-stretch sm:justify-end bg-black/50 backdrop-blur-sm" onClick={() => setEditingUser(null)}>
          <div
            className="bg-white h-full max-h-screen sm:max-h-screen w-full max-w-none sm:max-w-md shadow-2xl rounded-none sm:rounded-none overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 sm:slide-in-from-right-8 duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 text-white relative overflow-hidden flex-shrink-0">
              <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white/5 -mt-16 -mr-16" />
              <button onClick={() => setEditingUser(null)} className="absolute top-5 right-5 p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <X size={18} />
              </button>
              <UserAvatar user={editingUser} size="lg" className="mb-3 border-2 border-white/30 shadow-md" />
              <h2 className="text-lg font-black tracking-tight">{editingUser.name}</h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="text-[10px] font-bold bg-white/20 px-3 py-1 rounded-full uppercase tracking-widest">@{editingUser.username}</span>
                <span className="text-[10px] font-bold bg-white/20 px-3 py-1 rounded-full uppercase tracking-widest">{editingUser.role}</span>
              </div>
            </div>

            {/* Editable Fields */}
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Edit Profile Information</p>

              <EField label="Full Name" field="name" editForm={editForm} setEditForm={setEditForm} />
              <EField label="Contact Phone" field="contact" editForm={editForm} setEditForm={setEditForm} />
              <EField label="Date of Birth" field="dob" type="date" editForm={editForm} setEditForm={setEditForm} />
              <EField label="Blood Group" field="blood_group" options={['A+','A-','B+','B-','O+','O-','AB+','AB-']} editForm={editForm} setEditForm={setEditForm} />
              <EField label="Address" field="address" editForm={editForm} setEditForm={setEditForm} />


              {(activeTab === 'student' || activeTab === 'teacher') && (
                <EField label="Class / Standard" field="class" options={classes} allowCustom={true} editForm={editForm} setEditForm={setEditForm} />
              )}
              {activeTab === 'student' && (
                <EField label="Roll Number" field="roll_number" editForm={editForm} setEditForm={setEditForm} />
              )}
              {(activeTab === 'teacher' || activeTab === 'staff') && (
                <EField label="Qualification" field="qualification" editForm={editForm} setEditForm={setEditForm} />
              )}
              {activeTab === 'staff' && (
                <EField label="Designation" field="designation" editForm={editForm} setEditForm={setEditForm} />
              )}

              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">System Information</p>
              <EField label="Email Address" field="email" type="email" editForm={editForm} setEditForm={setEditForm} />
              <EField label="Username" field="username" editForm={editForm} setEditForm={setEditForm} />
              
              {/* Read-only info */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 mt-4">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">System Role</div>
                <div className="text-sm font-bold text-slate-700 uppercase">{editingUser.role}</div>
              </div>

              {/* Danger Zone */}
              {editingUser.id !== currentUser?.id && (
                <div className="p-4 bg-red-50 rounded-2xl border border-red-100 mt-6 flex flex-col gap-3">
                  <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Danger Zone</div>
                  <button
                    type="button"
                    onClick={() => {
                      const code = String(schoolSettings?.school_code || '').trim();
                      const isDemoAndDisabled = code === '100' && !platformSettings?.allow_demo_edit;
                      if (isDemoAndDisabled) {
                        setShowDemoModal(true);
                        return;
                      }
                      if (window.confirm(`Are you absolutely sure you want to permanently delete this user (${editingUser.name || editingUser.email})? This will delete their login credentials, attendance history, and all other related records. This action CANNOT be undone.`)) {
                        const confirmInput = window.prompt(`To proceed, please type 'DELETE' below:`);
                        if (confirmInput === 'DELETE') {
                          deleteUserMutation.mutate(editingUser.id);
                        } else {
                          alert('Deletion cancelled: Input did not match.');
                        }
                      }
                    }}
                    disabled={deleteUserMutation.isPending}
                    className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {deleteUserMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Delete User Account
                  </button>
                </div>
              )}
            </div>

            {/* Save Button */}
            <div className="p-6 border-t border-slate-100 flex-shrink-0 flex gap-3 sticky bottom-0 bg-white z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors rounded-xl hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => updateUserMutation.mutate()}
                disabled={updateUserMutation.isPending}
                className="flex-[2] py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg"
              >
                {updateUserMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD USER MODAL ── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[110] overflow-y-auto py-2 sm:py-10 flex items-center justify-center bg-black/60 backdrop-blur-sm px-2 sm:px-4">
          <div className="bg-white border border-border rounded-3xl p-4 sm:p-6 w-full max-w-2xl shadow-2xl animate-in slide-in-from-bottom-4 relative max-h-[96vh] sm:max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-5 flex-shrink-0">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">
                Register New {currentRole === 'teacher' ? 'Student' : (activeTab.charAt(0).toUpperCase() + activeTab.slice(1))}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 custom-scrollbar pr-1">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[['Full Name *', 'name', 'text', 'Jane Doe'], ['Username *', 'username', 'text', 'janedoe'], ['Email (Optional)', 'email', 'email', 'jane@school.com'], ['Password *', 'password', 'password', '••••••••']].map(([label, field, type, ph]) => (
                    <div key={field}>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">{label}</label>
                      <input type={type} value={addForm[field]} onChange={e => setAddForm(f => ({ ...f, [field]: e.target.value }))} placeholder={ph}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Date of Birth</label>
                    <input type="date" value={addForm.dob} onChange={e => setAddForm(f => ({ ...f, dob: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Blood Group</label>
                    <select value={addForm.bloodGroup} onChange={e => setAddForm(f => ({ ...f, bloodGroup: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="">Select...</option>
                      {['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Address</label>
                  <input type="text" value={addForm.address} onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))} placeholder="Full residential address"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Contact Phone</label>
                    <input type="text" value={addForm.contact} onChange={e => setAddForm(f => ({ ...f, contact: e.target.value }))} placeholder="+91..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  {(activeTab === 'student' || activeTab === 'teacher' || currentRole === 'teacher') && (
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Class / Standard</label>
                      <input
                        type="text"
                        list="addClassList"
                        value={addForm.userClass}
                        onChange={e => setAddForm(f => ({ ...f, userClass: e.target.value.toUpperCase() }))}
                        placeholder="e.g. 1ST, 2ND"
                        disabled={currentRole === 'teacher'}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-75 disabled:cursor-not-allowed"
                      />
                      <datalist id="addClassList">
                        {classes.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                  )}
                  {(activeTab === 'student' || currentRole === 'teacher') && (
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Roll Number</label>
                      <input
                        type="text"
                        value={addForm.rollNumber}
                        onChange={e => setAddForm(f => ({ ...f, rollNumber: e.target.value }))}
                        placeholder="e.g. 01, 10"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  )}
                </div>

                {(activeTab === 'teacher' || activeTab === 'staff') && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Qualification</label>
                      <input type="text" value={addForm.qualification} onChange={e => setAddForm(f => ({ ...f, qualification: e.target.value }))} placeholder="e.g. M.Sc, B.Ed"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>
                    {activeTab === 'staff' && (
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Designation</label>
                        <input type="text" value={addForm.designation} onChange={e => setAddForm(f => ({ ...f, designation: e.target.value }))} placeholder="e.g. Clerk, Librarian"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── BUS ALLOCATION (driver only) ─────────────────────────────── */}
            {activeTab === 'driver' && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 mb-3">
                  <Bus size={16} className="text-amber-500" />
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Bus Allocation (Optional)</p>
                </div>

                {/* Mode toggle */}
                <div className="flex gap-2 mb-3">
                  {[['existing', '📋 Assign to Existing Bus'], ['new', '➕ Create New Bus']].map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setBusAlloc(b => ({ ...b, mode: m }))}
                      className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all ${busAlloc.mode === m ? 'bg-amber-500 border-amber-500 text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-amber-300'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {busAlloc.mode === 'existing' ? (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Select Bus</label>
                    <select
                      value={busAlloc.existingBusId}
                      onChange={e => setBusAlloc(b => ({ ...b, existingBusId: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-amber-300"
                    >
                      <option value="">-- Skip / Assign Later --</option>
                      {existingBuses.map(b => (
                        <option key={b.id} value={b.id}>
                          Bus {b.bus_number}{b.route_name ? ` · ${b.route_name}` : ''}{b.driver_id ? ' (has driver)' : ''}
                        </option>
                      ))}
                    </select>
                    {existingBuses.length === 0 && (
                      <p className="text-[11px] text-slate-400 mt-1">No buses created yet. Switch to "Create New Bus" to add one.</p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Bus Number *</label>
                      <input
                        type="text"
                        value={busAlloc.newBusNumber}
                        onChange={e => setBusAlloc(b => ({ ...b, newBusNumber: e.target.value }))}
                        placeholder="e.g. 7"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest block mb-1.5">Route Name</label>
                      <input
                        type="text"
                        value={busAlloc.newRouteName}
                        onChange={e => setBusAlloc(b => ({ ...b, newRouteName: e.target.value }))}
                        placeholder="e.g. Morning — Civil Lines"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100 flex-shrink-0">
              <button onClick={() => { setIsAddModalOpen(false); setBusAlloc({ mode: 'existing', existingBusId: '', newBusNumber: '', newRouteName: '' }); }} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
              <button
                onClick={() => createUserMutation.mutate()}
                disabled={createUserMutation.isPending || !addForm.password || !addForm.name || !addForm.username}
                className="px-6 py-2.5 bg-primary text-white font-bold text-sm rounded-xl hover:bg-primary-dark transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {createUserMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                Save User
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── RESET PASSWORD MODAL ── */}
      {resettingUser && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in duration-200">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
                <Lock size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-slate-800 tracking-tight text-base">Manage Password</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Target: {resettingUser.name}</p>
              </div>
            </div>
            
            <p className="text-[11px] text-slate-500 mb-4 font-medium leading-relaxed">Set a new password for this user. Minimum 6 characters required.</p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block mb-1">New Password</label>
                <input
                  type="text"
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  placeholder="Enter new password..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-amber-300 font-bold"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setResettingUser(null); setNewPass(''); }}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const code = String(schoolSettings?.school_code || '').trim();
                    const isDemoAndDisabled = code === '100' && !platformSettings?.allow_demo_edit;
                    if (isDemoAndDisabled) {
                      setShowDemoModal(true);
                    } else {
                      resetPasswordMutation.mutate();
                    }
                  }}
                  disabled={resetPasswordMutation.isPending || newPass.length < 6}
                  className="flex-[1.5] py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl disabled:opacity-50 transition-all shadow-md shadow-amber-200 flex items-center justify-center gap-1.5"
                >
                  {resetPasswordMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <><Lock size={12} /> Manage Password</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE CLASS MODAL ── */}
      {isCreateClassModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <form
            onSubmit={handleSaveClass}
            className="bg-white border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in duration-200 relative"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
                <Plus size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-slate-800 tracking-tight text-base">Create Class</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">Manage Academy</p>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 mb-4 font-medium leading-relaxed">
              Enter the numeric grade or class number (e.g., 1, 2, 10, 11). Only numbers are accepted; the system will append the correct suffix (ST, ND, RD, TH) automatically.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block mb-1">Class Number</label>
                <input
                  type="text"
                  pattern="\d*"
                  inputMode="numeric"
                  value={newClassInput}
                  onChange={e => setNewClassInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 1, 3, 10..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 leading-normal focus:outline-none focus:ring-2 focus:ring-emerald-300 font-bold"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setIsCreateClassModalOpen(false); setNewClassInput(''); }}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newClassInput}
                  className="flex-[1.5] py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl disabled:opacity-50 transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-1.5"
                >
                  Create Class
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ── MANAGE SECTIONS / SUB-CLASSES MODAL ── */}
      {isManageSectionsModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in duration-200 relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center text-teal-600 shrink-0">
                  <Layers size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 tracking-tight text-base">Manage Class Sections</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Create Sub-Classes (e.g. 5TH - A, 5TH - B)</p>
                </div>
              </div>
              <button onClick={() => setIsManageSectionsModalOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18}/></button>
            </div>

            <form onSubmit={handleSaveSection} className="space-y-4 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block mb-1">Base Class</label>
                  <select
                    value={sectionClassSelect}
                    onChange={e => setSectionClassSelect(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block mb-1">Section Tag</label>
                  <input
                    type="text"
                    value={newSectionInput}
                    onChange={e => setNewSectionInput(e.target.value)}
                    placeholder="e.g. A, B, Rose..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-400 uppercase"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={!newSectionInput.trim()}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs rounded-xl disabled:opacity-50 transition-all shadow-md shadow-teal-200 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus size={16} /> Add Sub-Class Section
              </button>
            </form>

            <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Active School Classes & Sections ({classes.length})</h4>
              <div className="flex flex-wrap gap-2">
                {classes.map((cls) => (
                  <div key={cls} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
                    <span>{cls}</span>
                    {cls.includes('-') && (
                      <button onClick={() => handleDeleteSubClass(cls)} className="text-rose-400 hover:text-rose-600 cursor-pointer ml-1">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BULK UPLOAD MODAL ── */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-[110] overflow-y-auto py-2 sm:py-10 flex items-center justify-center bg-black/60 backdrop-blur-sm px-2 sm:px-4 animate-in fade-in duration-200">
          <div className="bg-white border border-border rounded-3xl p-4 sm:p-6 w-full max-w-4xl shadow-2xl relative max-h-[96vh] sm:max-h-[90vh] flex flex-col scale-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-5 flex-shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight">
                  Bulk Add {activeTab === 'staff' ? 'Staff' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}s
                </h3>
                <p className="text-xs text-slate-400 font-semibold">Upload users via Excel or CSV spreadsheets</p>
              </div>
              <button 
                onClick={resetBulkUploadState} 
                disabled={isProcessing}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Step Indicators */}
            <div className="flex items-center gap-3 mb-6 flex-shrink-0 select-none">
              {[
                { step: 1, label: 'Upload File' },
                { step: 2, label: 'Column Mapping' },
                { step: 3, label: 'Importing' },
                { step: 4, label: 'Summary' }
              ].map((s) => (
                <React.Fragment key={s.step}>
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      bulkStep === s.step 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                        : bulkStep > s.step 
                        ? 'bg-emerald-500 text-white' 
                        : 'bg-slate-100 text-slate-400'
                    }`}>
                      {bulkStep > s.step ? <Check size={12} strokeWidth={3} className="text-white" /> : s.step}
                    </div>
                    <span className={`text-xs font-bold transition-colors ${
                      bulkStep === s.step ? 'text-indigo-600' : bulkStep > s.step ? 'text-slate-700' : 'text-slate-400'
                    }`}>
                      {s.label}
                    </span>
                  </div>
                  {s.step < 4 && <div className={`flex-1 h-0.5 rounded transition-colors ${bulkStep > s.step ? 'bg-emerald-300' : 'bg-slate-100'}`} />}
                </React.Fragment>
              ))}
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 custom-scrollbar pr-1 min-h-[300px]">
              
              {/* STEP 1: UPLOAD FILE */}
              {bulkStep === 1 && (
                <div className="space-y-6">
                  {/* Instructions Alert */}
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex gap-3">
                    <BadgeInfo className="text-indigo-600 shrink-0 mt-0.5" size={18} />
                    <div className="text-xs text-indigo-900 leading-relaxed font-semibold">
                      <p className="font-bold text-indigo-950 mb-1">Spreadsheet Instructions:</p>
                      The system will automatically generate Usernames and Passwords if you leave those columns blank, or you can provide your own. Required fields are marked with an asterisk (*). Invalid classes or missing names will cause rows to fail.
                    </div>
                  </div>

                  {/* Actions Section */}
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch gap-4 relative">
                    
                    {/* Template Card */}
                    <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between items-start gap-4">
                      <div>
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl inline-block mb-3">
                          <FileSpreadsheet size={24} />
                        </div>
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Download Template</h4>
                        <p className="text-xs text-slate-500 font-semibold mt-1">Get a pre-formatted Excel template with correct role-specific column headers.</p>
                      </div>
                      <button
                        onClick={handleDownloadTemplate}
                        className="py-3 px-6 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs uppercase font-black tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-sm"
                      >
                        <Download size={14} /> Download template.xlsx
                      </button>
                    </div>

                    {/* OR Separator */}
                    <div className="flex md:flex-col items-center justify-center gap-2 py-2 md:py-0">
                      <div className="w-full md:w-px h-px md:h-12 bg-slate-200 flex-1" />
                      <span className="text-[10px] font-black text-slate-400 bg-white px-2 uppercase tracking-widest">OR</span>
                      <div className="w-full md:w-px h-px md:h-12 bg-slate-200 flex-1" />
                    </div>

                    {/* Upload File Card */}
                    <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between items-stretch gap-4 relative">
                      <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-2xl p-6 bg-white hover:bg-slate-50 transition-all cursor-pointer relative min-h-[140px]">
                        <Upload size={32} className="text-slate-400 mb-3" />
                        <span className="text-xs font-black text-slate-600 uppercase tracking-wider text-center">Click to browse file</span>
                        <span className="text-[10px] text-slate-400 font-semibold mt-1 text-center">Supports .xlsx, .xls, .csv files</span>
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={handleFileUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* STEP 2: COLUMN MAPPING & PREVIEW */}
              {bulkStep === 2 && (
                <div className="space-y-6">
                  {/* Warning Alert */}
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3">
                    <div className="text-blue-500 shrink-0 mt-0.5"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></div>
                    <div className="text-xs text-blue-900 leading-relaxed font-semibold">
                      <p className="font-bold text-blue-950 mb-1">Check Columns:</p>
                      Make sure your Excel data matches the correct fields below. You can change them if they look wrong.
                    </div>
                  </div>

                  {/* Mapping Fields Grid */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 pb-2 border-b border-slate-200">
                      MATCH EXCEL COLUMNS
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {getTargetFieldsForRole(activeTab).map((field) => (
                        <div key={field.key} className="flex flex-col gap-1.5">
                          <label className="text-[10px] uppercase font-black text-slate-500 tracking-wider">
                            {field.label}
                          </label>
                          <select
                            value={bulkMappings[field.key] || ''}
                            onChange={(e) => setBulkMappings(m => ({ ...m, [field.key]: e.target.value }))}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-300"
                          >
                            <option value="">-- Skip / Auto-generate --</option>
                            {bulkHeaders.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                   {/* Data Preview Table */}
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-3 bg-slate-50 text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">
                      Data Preview ({bulkRows.length} Rows Parsed)
                    </div>
                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto custom-scrollbar">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            {getTargetFieldsForRole(activeTab).map(field => (
                              <th key={field.key} className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap font-bold">
                                {field.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {bulkRows.map((row, rIdx) => (
                            <tr key={rIdx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                              {getTargetFieldsForRole(activeTab).map(field => {
                                const colName = bulkMappings[field.key];
                                const colIndex = bulkHeaders.indexOf(colName);
                                const val = colIndex !== -1 ? row[colIndex] : '';
                                return (
                                  <td key={field.key} className="p-3 text-xs font-bold text-slate-700 whitespace-nowrap">
                                    {val === null || val === undefined || val === '' ? (
                                      <span className="text-slate-400 dark:text-slate-500 italic font-semibold">
                                        {field.key === 'password' ? 'School@123' : field.key === 'email' ? 'Auto-generated' : 'Blank'}
                                      </span>
                                    ) : (
                                      val
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Preview Explanation Alert */}
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex gap-3">
                    <BadgeInfo className="text-indigo-600 shrink-0 mt-0.5" size={18} />
                    <div className="text-xs text-indigo-900 leading-relaxed font-semibold">
                      <p className="font-bold text-indigo-950 mb-1">Data Preview Info:</p>
                      This step parses data from the spreadsheet and verifies formatting, but has <strong>NOT</strong> yet written anything to the database. You must click <strong>'Start Upload Queue'</strong> to commit changes.
                    </div>
                  </div>

                </div>
              )}

              {/* STEP 3: PROCESSING QUEUE */}
              {bulkStep === 3 && (
                <div className="flex flex-col items-center justify-center py-12 px-6 space-y-6">
                  <div className="relative flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full border-4 border-indigo-100 animate-pulse" />
                    <Loader2 className="animate-spin text-indigo-600 absolute" size={40} />
                  </div>

                  <div className="text-center space-y-2">
                    <h4 className="text-base font-black text-slate-800 uppercase tracking-wider">Importing Records</h4>
                    <p className="text-xs text-slate-500 font-semibold">Creating authentication profiles and database rows. Please do not close the window.</p>
                  </div>

                  {/* Progress bar container */}
                  <div className="w-full max-w-md bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                    <div 
                      className="bg-indigo-600 h-full rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(79,70,229,0.3)]"
                      style={{ width: `${bulkProgress}%` }}
                    />
                  </div>
                  <span className="text-sm font-black text-indigo-600">{bulkProgress}% Complete</span>

                  {/* Time Warning Box */}
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex gap-3 max-w-md w-full text-left">
                    <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                    <div className="text-xs text-amber-900 leading-relaxed font-semibold">
                      <p className="font-bold text-amber-950 mb-1">Time Warning:</p>
                      Please wait. Writing to the database can take up to 2-3 minutes depending on your internet connection speed and the size of your upload. Do not close this browser or reload the page.
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: IMPORT SUMMARY */}
              {bulkStep === 4 && bulkResults && (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Rows</div>
                      <div className="text-2xl font-black text-slate-800 mt-1">
                        {bulkResults.successList.length + bulkResults.failureList.length}
                      </div>
                    </div>

                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-center">
                      <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Imported Successfully</div>
                      <div className="text-2xl font-black text-emerald-600 mt-1 flex items-center justify-center gap-1.5">
                        <CheckCircle2 size={20} className="text-emerald-500" /> {bulkResults.successList.length}
                      </div>
                    </div>

                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-center">
                      <div className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Errors Encountered</div>
                      <div className="text-2xl font-black text-rose-600 mt-1 flex items-center justify-center gap-1.5">
                        {bulkResults.failureList.length > 0 ? <AlertCircle size={20} className="text-rose-500" /> : <CheckCircle2 size={20} className="text-emerald-500" />}
                        {bulkResults.failureList.length}
                      </div>
                    </div>

                  </div>

                  {/* Actions Area */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="text-xs text-slate-500 font-semibold text-center sm:text-left">
                      Download the credentials list to distribute usernames/passwords, or the failure sheet to correct errors.
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto shrink-0">
                      {bulkResults.failureList.length > 0 && (
                        <button
                          onClick={handleDownloadFailures}
                          className="flex-1 sm:flex-initial py-3 px-5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-rose-100"
                        >
                          <Download size={14} /> Download Failed Rows
                        </button>
                      )}
                      <button
                        onClick={handleDownloadCredentials}
                        className="flex-1 sm:flex-initial py-3 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-100"
                      >
                        <Download size={14} /> Download Credentials
                      </button>
                    </div>
                  </div>

                  {/* Error details if any */}
                  {bulkResults.failureList.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm max-h-[250px] overflow-y-auto custom-scrollbar">
                      <div className="p-3 bg-slate-50 text-xs font-black text-rose-500 uppercase tracking-widest border-b border-slate-200 sticky top-0">
                        Error Logs List
                      </div>
                      <div className="divide-y divide-slate-100">
                        {bulkResults.failureList.map((err, idx) => (
                          <div key={idx} className="p-3 text-xs font-semibold text-slate-700 flex gap-2 items-start">
                            <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-[10px] font-black shrink-0 mt-0.5">Row {err.rowNum}</span>
                            <div className="flex-1">
                              <span className="font-bold text-slate-900">{err.name}:</span> <span className="text-slate-500">{err.reason}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>

            {/* Footer Buttons */}
            <div className="p-6 border-t border-slate-100 flex-shrink-0 flex gap-3 sticky bottom-0 bg-white z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] mt-4">
              {bulkStep === 1 && (
                <button
                  onClick={resetBulkUploadState}
                  className="w-full py-3 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors rounded-xl"
                >
                  Cancel
                </button>
              )}
              {bulkStep === 2 && (
                <>
                  <button
                    onClick={() => setBulkStep(1)}
                    className="flex-1 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors rounded-xl border border-slate-200"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleStartImport}
                    className="flex-[2] py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-sm rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg"
                  >
                    <Play size={16} /> Start Upload Queue
                  </button>
                </>
              )}
              {bulkStep === 4 && (
                <button
                  onClick={() => {
                    const needsFailures = bulkResults?.failureList?.length > 0 && !downloadedFailures;
                    const needsCredentials = bulkResults?.successList?.length > 0 && !downloadedCredentials;
                    if (needsFailures && needsCredentials) {
                      alert('Please download both the "Download Failed Rows" and "Download Credentials" files before closing.');
                      return;
                    } else if (needsFailures) {
                      alert('Please download the "Download Failed Rows" file before closing.');
                      return;
                    } else if (needsCredentials) {
                      alert('Please download the "Download Credentials" file before closing.');
                      return;
                    }
                    resetBulkUploadState();
                  }}
                  disabled={(bulkResults?.failureList?.length > 0 && !downloadedFailures) || (bulkResults?.successList?.length > 0 && !downloadedCredentials)}
                  className={`w-full py-3 font-black text-sm rounded-xl transition-colors ${
                    (bulkResults?.failureList?.length > 0 && !downloadedFailures) || (bulkResults?.successList?.length > 0 && !downloadedCredentials)
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                  }`}
                >
                  {(bulkResults?.failureList?.length > 0 && !downloadedFailures) || (bulkResults?.successList?.length > 0 && !downloadedCredentials)
                    ? '⬇ Download files to enable Finish'
                    : 'Finish & Close'}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {showDemoModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.70)', padding: '16px' }}>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-[440px] text-center p-8 shadow-2xl relative" style={{ borderLeft: '4px solid #6366f1' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white mb-3">Action Restricted</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              This is a demo school for global testing. You cannot delete or alter core data here. You will get 100% control over your data when you register your own school.
            </p>
            <button
              onClick={() => setShowDemoModal(false)}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-sm rounded-xl transition-all shadow-lg"
            >
              Got it, Continue
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
