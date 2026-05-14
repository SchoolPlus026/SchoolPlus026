import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../config/supabaseClient';
import { BookOpen, Plus, Trash2, Edit2, X, Play, Save, ChevronDown, ChevronUp, Youtube, HardDrive, Loader2 } from 'lucide-react';

function extractYouTubeThumbnail(url) {
  const m = url?.match(/(?:youtu\.be\/|v=|embed\/)([^?&]+)/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

// ─── Category Form ──────────────────────────────────────────────────────────
function CategoryForm({ initial = {}, onSave, onCancel, saving }) {
  const [name, setName]               = useState(initial.name || '');
  const [description, setDescription] = useState(initial.description || '');
  const [sortOrder, setSortOrder]     = useState(initial.sort_order ?? 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ name: name.trim(), description: description.trim(), sort_order: Number(sortOrder) });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="muted small block mb-1 font-semibold">Category Name *</label>
        <input required className="sp-input block w-full" placeholder="e.g. For School Admin" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div>
        <label className="muted small block mb-1 font-semibold">Description (optional)</label>
        <input className="sp-input block w-full" placeholder="Short description" value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div>
        <label className="muted small block mb-1 font-semibold">Sort Order</label>
        <input type="number" min="0" className="sp-input block w-full" value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" className="btn outline flex-1" onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={saving} className="btn accent flex-2">
          <Save size={15} /> {saving ? 'Saving...' : 'Save Category'}
        </button>
      </div>
    </form>
  );
}

// ─── Article Form ───────────────────────────────────────────────────────────
function ArticleForm({ categories, initial = {}, onSave, onCancel, saving }) {
  const [categoryId, setCategoryId]   = useState(initial.category_id || categories[0]?.id || '');
  const [title, setTitle]             = useState(initial.title || '');
  const [description, setDescription] = useState(initial.description || '');
  const [videoType, setVideoType]     = useState(initial.video_type || 'youtube');
  const [videoUrl, setVideoUrl]       = useState(initial.video_url || '');
  const [targetModule, setTargetModule] = useState(initial.target_module || 'none');
  const [sortOrder, setSortOrder]     = useState(initial.sort_order ?? 0);
  const [isPublished, setIsPublished] = useState(initial.is_published !== false);
  const [uploading, setUploading]     = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const fileRef = useRef(null);

  const ytThumb = videoType === 'youtube' ? extractYouTubeThumbnail(videoUrl) : null;

  async function handleDriveUpload(files) {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    setUploading(true); setUploadError('');
    setUploadProgress({ current: 0, total: fileArray.length });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = { Authorization: `Bearer ${session?.access_token}` };

      const { data: folderData, error: folderErr } = await supabase.functions.invoke('gdrive-upload', {
        body: { action: 'create_folder', folderName: 'SchoolOS_KnowledgeBase', driveIndex: 0 }, headers,
      });
      if (folderErr || folderData?.error) throw new Error(folderData?.error || 'Could not create Drive folder');

      const uploadedUrls = [];
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setUploadProgress({ current: i + 1, total: fileArray.length });
        
        const reader = new FileReader();
        const fileBase64 = await new Promise((res, rej) => {
          reader.onload = () => res(reader.result.split(',')[1]);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });

        const { data: uploadData, error: uploadErr } = await supabase.functions.invoke('gdrive-upload', {
          body: {
            action: 'upload_file', parentFolderId: folderData.id,
            fileName: `kb_${Date.now()}_${file.name}`,
            mimeType: file.type || 'video/mp4', fileBase64,
          }, headers,
        });
        if (uploadErr || uploadData?.error) throw new Error(uploadData?.error || 'Upload failed');
        uploadedUrls.push({ 
          url: `https://drive.google.com/file/d/${uploadData.id}/preview`,
          name: file.name.replace(/\.[^/.]+$/, "") 
        });
      }

      if (uploadedUrls.length === 1) {
        setVideoUrl(uploadedUrls[0].url);
        if (!title) setTitle(uploadedUrls[0].name);
      } else {
        // Bulk add
        onSave(uploadedUrls.map(item => ({
          category_id: categoryId,
          title: item.name,
          description: '',
          video_type: 'gdrive',
          video_url: item.url,
          target_module: targetModule === 'none' ? null : targetModule,
          is_published: false,
          sort_order: 0
        })), true); // Pass true for isBulk
      }
    } catch (err) { setUploadError(err.message); }
    finally { setUploading(false); setUploadProgress({ current: 0, total: 0 }); }
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ category_id: categoryId, title: title.trim(), description: description.trim(), video_type: videoType, video_url: videoUrl.trim(), thumbnail_url: ytThumb || null, target_module: targetModule === 'none' ? null : targetModule, sort_order: Number(sortOrder), is_published: isPublished });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="muted small block mb-1 font-semibold">Category *</label>
          <select required className="sp-input block w-full" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="muted small block mb-1 font-semibold">Video Type *</label>
          <select required className="sp-input block w-full" value={videoType} onChange={e => { setVideoType(e.target.value); setVideoUrl(''); }}>
            <option value="youtube">YouTube</option>
            <option value="gdrive">Google Drive</option>
          </select>
        </div>
      </div>

      <div>
        <label className="muted small block mb-1 font-semibold">Article Title *</label>
        <input required className="sp-input block w-full" placeholder="e.g. How to mark attendance" value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      <div>
        <label className="muted small block mb-1 font-semibold">Description (optional)</label>
        <input className="sp-input block w-full" placeholder="Brief description" value={description} onChange={e => setDescription(e.target.value)} />
      </div>

      <div>
        <label className="muted small block mb-1 font-semibold">Target Module Connection</label>
        <select className="sp-input block w-full" value={targetModule} onChange={e => setTargetModule(e.target.value)}>
          <option value="none">None (General Tutorial)</option>
          <option value="attendance">Attendance</option>
          <option value="timetable">Timetable</option>
          <option value="fees">Fees</option>
          <option value="notices">Notices</option>
          <option value="users">Manage Users</option>
          <option value="lost_found">Lost & Found</option>
          <option value="bus_alerts">Bus Tracker</option>
          <option value="syllabus">Syllabus Tracker</option>
          <option value="mood_note">Mood Note</option>
          <option value="off_classes">Off Classes</option>
          <option value="leaves">Leaves</option>
          <option value="reports">Reports</option>
          <option value="gallery">Gallery</option>
          <option value="complaint_box">Complaint Box</option>
          <option value="contact">Contact</option>
          <option value="settings">Settings</option>
        </select>
        <p className="text-[10px] text-slate-500 mt-1">If a user clicks "Help" in this module, they will be auto-routed to this video.</p>
      </div>

      <div>
        <label className="muted small block mb-1 font-semibold">
          {videoType === 'youtube' ? 'YouTube URL *' : 'Google Drive Video'}
        </label>
        {videoType === 'youtube' ? (
          <div className="flex gap-2 items-center">
            <Youtube size={18} className="text-red-400 flex-shrink-0" />
            <input required className="sp-input block w-full" placeholder="https://youtu.be/..." value={videoUrl} onChange={e => setVideoUrl(e.target.value)} />
          </div>
        ) : (
          <div>
            <input 
              type="file" 
              ref={fileRef} 
              style={{ display: 'none' }} 
              accept="video/*,image/*" 
              multiple 
              onChange={e => handleDriveUpload(e.target.files)} 
            />
            {videoUrl ? (
              <div className="flex items-center gap-3 p-3 bg-blue-900/20 border border-blue-500/30 rounded-xl">
                <HardDrive size={18} className="text-blue-400 flex-shrink-0" />
                <span className="text-sm text-blue-300 flex-1 truncate">{videoUrl}</span>
                <button type="button" onClick={() => setVideoUrl('')} className="text-red-400 hover:text-red-300"><X size={14} /></button>
              </div>
            ) : (
              <div
                onClick={() => { 
                  if (uploading) return;
                  fileRef.current?.click();
                }}
                style={{ border: '2px dashed rgba(59,130,246,0.4)', borderRadius: 12, padding: '24px 16px', textAlign: 'center', cursor: uploading ? 'wait' : 'pointer', background: 'rgba(59,130,246,0.05)' }}>
                {uploading ? (
                  <>
                    <Loader2 size={24} className="animate-spin text-blue-400 mx-auto mb-2" />
                    <div className="text-sm text-blue-300 font-bold">Uploading ({uploadProgress.current}/{uploadProgress.total})</div>
                    <div className="w-full bg-blue-900/20 h-1.5 rounded-full mt-3 max-w-[200px] mx-auto overflow-hidden">
                      <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }} />
                    </div>
                  </>
                ) : (
                  <><HardDrive size={24} className="text-blue-400 mx-auto mb-2" /><div className="text-sm text-slate-300 font-semibold">Click to upload video to Google Drive</div><div className="text-xs text-slate-500 mt-1">Multi-select supported (MP4, MOV, Image)</div></>
                )}
              </div>
            )}
            {uploadError && <div className="text-red-400 text-xs mt-2">{uploadError}</div>}
            <div className="text-xs text-slate-500 mt-2">Or paste a Drive URL directly:</div>
            <input className="sp-input block w-full mt-1" placeholder="https://drive.google.com/file/d/..." value={videoUrl} onChange={e => setVideoUrl(e.target.value)} />
          </div>
        )}
        {ytThumb && (
          <div className="mt-2 rounded-xl overflow-hidden border border-slate-700/50" style={{ maxWidth: 240 }}>
            <img src={ytThumb} alt="Thumbnail preview" className="w-full" />
            <div className="text-[10px] text-center py-1 bg-slate-800 text-slate-400 font-semibold">Thumbnail auto-fetched ✓</div>
          </div>
        )}
      </div>

      <div className="flex gap-4 items-center">
        <div className="flex-1">
          <label className="muted small block mb-1 font-semibold">Sort Order</label>
          <input type="number" min="0" className="sp-input block w-full" value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 mt-5">
          <input type="checkbox" id="isPublished" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
          <label htmlFor="isPublished" className="text-sm font-semibold cursor-pointer">Published (visible to all users)</label>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" className="btn outline flex-1" onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={saving} className="btn accent" style={{ flex: 2 }}>
          <Save size={15} /> {saving ? 'Saving...' : 'Save Article'}
        </button>
      </div>
    </form>
  );
}


// ─── Main Panel ─────────────────────────────────────────────────────────────
export default function PlatformKnowledgeBaseManager() {
  const qc = useQueryClient();
  const [saving, setSaving]                     = useState(false);
  const [expandedCat, setExpandedCat]           = useState(null);

  // Category modals
  const [showAddCat, setShowAddCat]             = useState(false);
  const [editingCat, setEditingCat]             = useState(null);

  // Article modals
  const [showAddArticle, setShowAddArticle]     = useState(null); // category_id
  const [editingArticle, setEditingArticle]     = useState(null);

  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: ['kb_categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('kb_categories').select('*').order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: articles = [] } = useQuery({
    queryKey: ['kb_articles_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_articles')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['kb_categories'] });
    qc.invalidateQueries({ queryKey: ['kb_articles_all'] });
    qc.invalidateQueries({ queryKey: ['kb_articles'] });
  };

  // ── Category CRUD ──────────────────────────────────────────────────────────
  const handleAddCategory = async (payload) => {
    setSaving(true);
    const { error } = await supabase.from('kb_categories').insert(payload);
    setSaving(false);
    if (error) return alert('Error: ' + error.message);
    setShowAddCat(false);
    refresh();
  };

  const handleEditCategory = async (payload) => {
    setSaving(true);
    const { error } = await supabase.from('kb_categories').update(payload).eq('id', editingCat.id);
    setSaving(false);
    if (error) return alert('Error: ' + error.message);
    setEditingCat(null);
    refresh();
  };

  const handleDeleteCategory = async (cat) => {
    if (!window.confirm(`Delete category "${cat.name}" and ALL its articles? This cannot be undone.`)) return;
    const { error } = await supabase.from('kb_categories').delete().eq('id', cat.id);
    if (error) return alert('Error: ' + error.message);
    refresh();
  };

  // ── Article CRUD ────────────────────────────────────────────────────────────
  const handleAddArticle = async (payload, isBulk = false) => {
    setSaving(true);
    let error;
    if (isBulk && Array.from(payload)) {
      const { error: bulkErr } = await supabase.from('kb_articles').insert(payload);
      error = bulkErr;
    } else {
      const { error: singleErr } = await supabase.from('kb_articles').insert({ ...payload, category_id: showAddArticle });
      error = singleErr;
    }
    setSaving(false);
    if (error) return alert('Error: ' + error.message);
    setShowAddArticle(null);
    refresh();
  };

  const handleEditArticle = async (payload) => {
    setSaving(true);
    const { error } = await supabase.from('kb_articles').update(payload).eq('id', editingArticle.id);
    setSaving(false);
    if (error) return alert('Error: ' + error.message);
    setEditingArticle(null);
    refresh();
  };

  const handleDeleteArticle = async (article) => {
    if (!window.confirm(`Delete article "${article.title}"?`)) return;
    const { error } = await supabase.from('kb_articles').delete().eq('id', article.id);
    if (error) return alert('Error: ' + error.message);
    refresh();
  };

  const togglePublish = async (article) => {
    const { error } = await supabase
      .from('kb_articles')
      .update({ is_published: !article.is_published })
      .eq('id', article.id);
    if (error) alert('Error: ' + error.message);
    else refresh();
  };

  return (
    <div className="card fade-in">
      {/* Section Header */}
      <div className="settings-header flex justify-between items-center">
        <div className="flex gap-4 items-center">
          <div className="icon-box"><BookOpen size={20} /></div>
          <div className="text-content">
            <h4>Knowledge Base Manager</h4>
            <p>Manage tutorial categories and video articles for all users.</p>
          </div>
        </div>
        <button className="btn accent" onClick={() => setShowAddCat(true)}>
          <Plus size={16} /> Add Category
        </button>
      </div>

      {/* ── Add/Edit Category Modals ── */}
      {(showAddCat || editingCat) && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4">
          <div className="card w-full max-w-md">
            <h3 className="mb-1">{editingCat ? 'Edit Category' : 'New Category'}</h3>
            <p className="muted small mb-5">{editingCat ? 'Update the category details.' : 'Create a new tutorial category.'}</p>
            <CategoryForm
              initial={editingCat || {}}
              onSave={editingCat ? handleEditCategory : handleAddCategory}
              onCancel={() => { setShowAddCat(false); setEditingCat(null); }}
              saving={saving}
            />
          </div>
        </div>
      )}

      {/* ── Add/Edit Article Modals ── */}
      {(showAddArticle || editingArticle) && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
          <div className="card w-full max-w-xl my-auto">
            <h3 className="mb-1">{editingArticle ? 'Edit Article' : 'New Tutorial Article'}</h3>
            <p className="muted small mb-5">Add a YouTube link or Google Drive video link.</p>
            <ArticleForm
              categories={categories}
              initial={editingArticle || {}}
              onSave={editingArticle ? handleEditArticle : handleAddArticle}
              onCancel={() => { setShowAddArticle(null); setEditingArticle(null); }}
              saving={saving}
            />
          </div>
        </div>
      )}

      {/* ── Category List ── */}
      <div className="mt-6 space-y-3">
        {loadingCats ? (
          <div className="text-center py-8 text-muted">Loading categories...</div>
        ) : categories.length === 0 ? (
          <div className="text-center py-8 text-muted">No categories yet. Click "Add Category" to start.</div>
        ) : (
          categories.map(cat => {
            const catArticles = articles.filter(a => a.category_id === cat.id);
            const isExpanded  = expandedCat === cat.id;

            return (
              <div key={cat.id} className="border border-slate-700/50 rounded-2xl overflow-hidden">
                {/* Category Row */}
                <div className="flex items-center gap-3 p-4 bg-slate-800/40 cursor-pointer" onClick={() => setExpandedCat(isExpanded ? null : cat.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm">{cat.name}</div>
                    {cat.description && <div className="text-xs text-slate-500 mt-0.5">{cat.description}</div>}
                  </div>
                  <span className="badge badge-info text-[10px]">{catArticles.length} articles</span>
                  <div className="flex items-center gap-2 ml-2">
                    <button className="text-indigo-400 hover:text-indigo-300 text-xs font-semibold"
                      onClick={e => { e.stopPropagation(); setEditingCat(cat); }}>
                      <Edit2 size={14} />
                    </button>
                    <button className="text-red-400 hover:text-red-300 text-xs"
                      onClick={e => { e.stopPropagation(); handleDeleteCategory(cat); }}>
                      <Trash2 size={14} />
                    </button>
                    {isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                  </div>
                </div>

                {/* Articles List (expanded) */}
                {isExpanded && (
                  <div className="bg-slate-900/30">
                    {catArticles.length === 0 ? (
                      <div className="text-center py-4 text-xs text-slate-600">No articles in this category yet.</div>
                    ) : (
                      catArticles.map(art => {
                        const thumb = art.thumbnail_url || (art.video_type === 'youtube' ? extractYouTubeThumbnail(art.video_url) : null);
                        return (
                          <div key={art.id} className="flex items-center gap-3 px-4 py-3 border-t border-slate-800/60">
                            {/* Thumbnail */}
                            <div className="w-16 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-800">
                              {thumb
                                ? <img src={thumb} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center"><Play size={16} className="text-slate-600" /></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-white truncate">{art.title}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${art.video_type === 'youtube' ? 'bg-red-900/50 text-red-400' : 'bg-blue-900/50 text-blue-400'}`}>
                                  {art.video_type === 'youtube' ? 'YouTube' : 'Drive'}
                                </span>
                                <button onClick={() => togglePublish(art)} className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${art.is_published ? 'bg-emerald-900/50 text-emerald-400 hover:bg-red-900/50 hover:text-red-400' : 'bg-slate-700 text-slate-500 hover:bg-emerald-900/50 hover:text-emerald-400'}`}>
                                  {art.is_published ? 'Published' : 'Draft'}
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button className="text-indigo-400 hover:text-indigo-300"
                                onClick={() => setEditingArticle(art)}>
                                <Edit2 size={14} />
                              </button>
                              <button className="text-red-400 hover:text-red-300"
                                onClick={() => handleDeleteArticle(art)}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                    {/* Add article button inside category */}
                    <div className="px-4 py-3 border-t border-slate-800/60">
                      <button className="btn outline text-xs w-full" style={{ padding: '8px' }}
                        onClick={() => setShowAddArticle(cat.id)}>
                        <Plus size={14} /> Add Tutorial to "{cat.name}"
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
