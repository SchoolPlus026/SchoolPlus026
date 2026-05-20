import React, { useEffect, useState } from 'react';
import { supabase } from '../../config/supabaseClient';
import { useAppStore } from '../../store/useAppStore';
import { Search, Plus, MapPin, CheckCircle, Loader2, Camera, Trash2, User, Eye, X } from 'lucide-react';

export default function LostAndFound() {
  const { schoolSettings, user, role } = useAppStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState([]);
  
  // Form State
  const [showForm, setShowForm] = useState(false);
  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');
  const [locationFound, setLocationFound] = useState('');
  const [targetClass, setTargetClass] = useState('');
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewItem, setViewItem] = useState(null);

  const getThumbnailLink = (url) => {
    if (!url) return '';
    const match = url.match(/\/d\/(.*?)\//);
    if (match && match[1]) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200-h200`;
    return url;
  };

  useEffect(() => {
    if (schoolSettings?.school_id) {
      fetchItems();
      setClasses(schoolSettings.classes || []);
    }
  }, [schoolSettings?.school_id, user?.class]);

  const fetchItems = async () => {
    setLoading(true);
    let query = supabase
      .from('lost_and_found')
      .select('*, reported_user:users!reported_by(id, name, role), claimed_by_user:users!claimed_by(name, role)')
      .eq('school_id', schoolSettings.school_id)
      .order('created_at', { ascending: false });
    
    if (role === 'student' || role === 'teacher') {
      if (user?.class) {
        query = query.or(`target_class.is.null,target_class.eq.${user.class}`);
      } else {
        query = query.is('target_class', null);
      }
    }

    const { data, error } = await query;
    if (!error && data) setItems(data);
    setLoading(false);
  };

  const handleReport = async (e) => {
    e.preventDefault();
    if (!file) {
      alert("Please upload a photo of the item.");
      return;
    }
    setSubmitting(true);

    try {
      // 1. Convert file to base64
      const fileBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data: { session } } = await supabase.auth.getSession();
      const headers = { Authorization: `Bearer ${session?.access_token}` };

      // Pre-flight check: Ensure GDrive is connected
      const hasConfig = schoolSettings?.gdrive_config && schoolSettings.gdrive_config.length > 0;
      if (!hasConfig) {
        throw new Error("Google Drive is not connected. Please go to Settings to connect a Drive account before uploading items.");
      }

      // 2. Create parent folder for this item
      const { data: folderData, error: folderError } = await supabase.functions.invoke('gdrive-upload', {
        body: { action: 'create_folder', folderName: `Lost_Found_${itemName.replace(/[^a-zA-Z0-9]/g, '_')}`, driveIndex: 0, school_id: schoolSettings.school_id },
        headers
      });

      if (folderError) {
        let msg = folderError.message;
        try { if (folderError.context && folderError.context.json) { const j = await folderError.context.json(); if(j.error) msg = j.error; } } catch(e){}
        throw new Error(msg || "Failed to create Google Drive folder.");
      }
      if (!folderData?.id) throw new Error(folderData?.error || "Failed to create Google Drive folder. No ID returned.");

      // 3. Upload file
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('gdrive-upload', {
        body: {
          action: 'upload_file',
          parentFolderId: folderData.id,
          fileName: file.name.replace(/[^a-zA-Z0-9.]/g, '_'),
          mimeType: file.type || 'application/octet-stream',
          fileBase64: fileBase64,
          driveIndex: 0,
          school_id: schoolSettings.school_id
        },
        headers
      });

      if (uploadError) {
        let msg = uploadError.message;
        try { if (uploadError.context && uploadError.context.json) { const j = await uploadError.context.json(); if(j.error) msg = j.error; } } catch(e){}
        throw new Error(msg || "Failed to upload image to Google Drive.");
      }
      if (!uploadData?.webViewLink) throw new Error(uploadData?.error || "Failed to upload image to Google Drive.");

      // 4. Save to DB
      const { error: dbError } = await supabase.from('lost_and_found').insert({
        school_id: schoolSettings.school_id,
        reported_by: user.id,
        item_name: itemName,
        description,
        location_found: locationFound,
        photo_url: uploadData.webViewLink,
        target_class: targetClass || null,
        status: 'active'
      });

      if (dbError) throw dbError;

      setShowForm(false);
      setItemName(''); setDescription(''); setLocationFound(''); setFile(null); setTargetClass('');
      fetchItems();
    } catch (err) {
      console.error("Submission Error:", err);
      let errMsg = err?.message;
      if (err?.context && typeof err.context.text === 'function') {
        try { errMsg = await err.context.text(); } catch(e){}
      }
      alert(`Error: ${errMsg || JSON.stringify(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaim = async (id, reportedById) => {
    const details = window.prompt("Please provide details/proof to claim this item:");
    if (!details) return;
    const { error } = await supabase.from('lost_and_found').update({ status: 'claimed', claimed_by: user.id }).eq('id', id);
    if (!error) {
      alert("Claim submitted successfully! The admin will verify.");
      
      if (reportedById && reportedById !== user.id) {
        await supabase.from('app_notifications_queue').insert({
          school_id: schoolSettings.school_id,
          sender_id: user.id,
          recipient_id: reportedById,
          type: 'lost_found_claim',
          title: 'Found Item Claimed!',
          body: `Someone has claimed the item you reported.`,
          is_ephemeral: false,
          status: 'pending'
        });
      }

      fetchItems();
    }
  };

  const handleResolve = async (id) => {
    if (!window.confirm("Mark this item as returned/resolved?")) return;
    const { error } = await supabase.from('lost_and_found').update({ status: 'resolved' }).eq('id', id);
    if (!error) fetchItems();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this report completely?")) return;
    const { error } = await supabase.from('lost_and_found').delete().eq('id', id);
    if (error) alert("Failed to delete: " + error.message);
    else fetchItems();
  };

  const canManage = role === 'admin' || role === 'platform_admin';

  return (
    <div className="space-y-6 fade-in pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-100 uppercase tracking-widest">Lost & Found</h2>
          <p className="text-sm text-slate-400 font-semibold">Digital notice board for misplaced items.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary py-2.5">
          {showForm ? 'Cancel' : <><Plus size={18}/> Report Found Item</>}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleReport} className="sp-card space-y-4 border border-indigo-500/30">
          <h3 className="text-sm font-black text-indigo-400 uppercase tracking-widest mb-4">Report a Found Item</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Item Name</label>
              <input required value={itemName} onChange={e=>setItemName(e.target.value)} className="sp-input w-full" placeholder="e.g. Blue Jacket, Thermos" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Location Found</label>
              <input required value={locationFound} onChange={e=>setLocationFound(e.target.value)} className="sp-input w-full" placeholder="e.g. Playground, Room 102" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Visibility Filter</label>
              <select value={targetClass} onChange={e=>setTargetClass(e.target.value)} className="sp-input w-full">
                <option value="">Entire School</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Photo Upload (Required)</label>
              <div className="relative">
                <input 
                  type="file" 
                  accept="image/*" 
                  required 
                  onChange={e => setFile(e.target.files[0])} 
                  className="sp-input w-full file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-500/20 file:text-indigo-300 hover:file:bg-indigo-500/30 cursor-pointer" 
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Description</label>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} className="sp-input w-full" placeholder="Any distinguishing marks..." rows={2} />
          </div>
          
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={submitting || !file} className="btn-primary py-2.5 px-6">
              {submitting ? <Loader2 size={18} className="animate-spin"/> : 'Upload to Drive & Post'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo-500" /></div>
      ) : items.length === 0 ? (
        <div className="sp-card text-center py-12">
          <Search size={48} className="mx-auto text-slate-600 mb-4" />
          <p className="text-slate-400 font-semibold">No items have been reported lost or found recently.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map(item => (
            <div key={item.id} className="sp-card flex flex-col relative overflow-hidden" style={{ opacity: item.status === 'resolved' ? 0.6 : 1 }}>
              {item.status === 'claimed' && (
                <div className="absolute top-0 left-0 w-full bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase text-center py-1 tracking-widest border-b border-amber-500/20">
                  Claim Pending
                </div>
              )}
              {item.status === 'resolved' && (
                <div className="absolute top-0 left-0 w-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase text-center py-1 tracking-widest border-b border-emerald-500/20">
                  Resolved / Returned
                </div>
              )}
              
              <div className="mt-4 flex gap-4">
                <div 
                  className={`w-16 h-16 rounded-xl bg-slate-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/5 ${item.photo_url ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                  onClick={() => item.photo_url && setViewItem(item)}
                >
                  {item.photo_url ? <img src={getThumbnailLink(item.photo_url)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Search className="text-slate-600" />}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-100">{item.item_name}</h4>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{item.description || 'No description provided.'}</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Eye size={14} className="text-cyan-400" />
                  Visibility: <span className="font-bold text-slate-300">{item.target_class || 'Entire School'}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <MapPin size={14} className="text-indigo-400" />
                  Found at: <span className="font-bold text-slate-300">{item.location_found}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <User size={14} className="text-pink-400" />
                  Reported by: <span className="font-bold text-slate-300">{item.reported_user?.name}</span>
                </div>
                {item.claimed_by_user && (
                  <div className="flex items-center gap-2 text-xs text-amber-400/80">
                    <CheckCircle size={14} className="text-amber-400" />
                    Claimed by: <span className="font-bold text-amber-300">{item.claimed_by_user.name}</span>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 flex gap-2 justify-end">
                {item.status === 'active' && item.reported_user?.name !== user.name && (
                  <button onClick={() => handleClaim(item.id, item.reported_user?.id)} className="px-4 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-bold rounded-lg transition-colors">
                    Claim This Is Mine
                  </button>
                )}
                
                {item.status === 'claimed' && canManage && (
                  <button onClick={() => handleResolve(item.id)} className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold rounded-lg transition-colors">
                    Mark Returned
                  </button>
                )}

                {canManage && (
                  <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Media Lightbox Modal */}
      {viewItem && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 p-2 sm:p-6 animate-in fade-in" onClick={() => setViewItem(null)}>
          <button 
            onClick={() => setViewItem(null)}
            className="absolute top-4 right-4 md:top-8 md:right-8 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md transition-all z-[110]"
          >
            <X size={24} />
          </button>
          
          <div className="w-full max-w-4xl h-[70vh] sm:h-[80vh] bg-slate-900 rounded-xl overflow-hidden shadow-2xl relative flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 bg-slate-800 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-white font-bold truncate pr-4">{viewItem.item_name}</h3>
              <a 
                href={viewItem.photo_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                View in Drive
              </a>
            </div>
            <div className="flex-1 bg-black w-full h-full relative">
              {viewItem.photo_url.includes('drive.google.com') ? (
                <iframe
                  src={viewItem.photo_url.replace(/\/view.*$/, '/preview').replace(/\/edit.*$/, '/preview')}
                  className="absolute inset-0 w-full h-full border-0"
                  allow="autoplay"
                  title="Media Preview"
                ></iframe>
              ) : (
                <img 
                  src={viewItem.photo_url} 
                  alt="Full size" 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
