import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../config/supabaseClient';
import { BookOpen, Play, ExternalLink, ChevronRight, Loader2, Search, HelpCircle, Image, Volume2, FileText, X } from 'lucide-react';
import { moduleWalkthroughs } from '../../config/moduleWalkthroughs';
import { useAppStore } from '../../store/useAppStore';
// ─── YouTube helpers ────────────────────────────────────────────────────────
function extractYouTubeId(url) {
  const patterns = [
    /youtu\.be\/([^?&]+)/,
    /[?&]v=([^?&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function getYouTubeThumbnail(url) {
  const id = extractYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

function getYouTubeEmbed(url) {
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : null;
}

// ─── GDrive helpers ─────────────────────────────────────────────────────────
function getGDriveEmbed(url) {
  if (!url) return null;
  // Robust extraction of FILE_ID from various Google Drive URL formats
  // Matches: /file/d/ID/view, /open?id=ID, /uc?id=ID, etc.
  const idMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || 
                  url.match(/id=([a-zA-Z0-9_-]+)/) ||
                  url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) return url; // Fallback to raw URL if we can't parse it
  return `https://drive.google.com/file/d/${idMatch[1]}/preview`;
}

// ─── Media Player Modal ─────────────────────────────────────────────────────
function MediaModal({ article, onClose }) {
  const [isClosing, setIsClosing] = useState(false);
  const [modalLang, setModalLang] = useState('en');

  const handleLanguageChange = (e) => {
    const val = e.target.value;
    setModalLang(val);
    
    // Update cookies
    if (val === 'en') {
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=.${window.location.hostname}; path=/;`;
    } else {
      document.cookie = `googtrans=/en/${val}; path=/`;
      document.cookie = `googtrans=/en/${val}; domain=.${window.location.hostname}; path=/`;
    }

    // Trigger changes in global translate element
    const selectEl = document.querySelector('.goog-te-combo');
    if (selectEl) {
      selectEl.value = val;
      selectEl.dispatchEvent(new Event('change'));
    }
  };

  useEffect(() => {
    // Sync initial state from current cookie if active
    const cookieMatch = document.cookie.match(/googtrans=\/en\/([a-z]+)/);
    if (cookieMatch) {
      setModalLang(cookieMatch[1]);
    }

    return () => {
      // Revert language back to English when modal is closed
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=.${window.location.hostname}; path=/;`;
      
      const selectEl = document.querySelector('.goog-te-combo');
      if (selectEl) {
        selectEl.value = 'en';
        selectEl.dispatchEvent(new Event('change'));
      }
    };
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const getGDriveDirectUrl = (url) => {
    if (!url) return '';
    const idMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || 
                    url.match(/id=([a-zA-Z0-9_-]+)/) ||
                    url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) return url;
    return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
  };

  const isVideo = article.video_type === 'youtube' || article.video_type === 'gdrive';
  const isImage = article.video_type === 'image';
  const isAudio = article.video_type === 'audio';
  const isDocument = article.video_type === 'document';
  const isTextOnly = article.video_type === 'text' || !article.video_url;

  let embedUrl = null;
  if (isVideo) {
    embedUrl = article.video_type === 'youtube'
      ? getYouTubeEmbed(article.video_url)
      : getGDriveEmbed(article.video_url);
  } else if (isDocument) {
    embedUrl = getGDriveEmbed(article.video_url);
  }

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-y-auto transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
      onClick={handleClose}
    >
      <div
        className={`bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl w-full max-w-3xl my-auto ${isClosing ? 'animate-shrink' : 'animate-emerge'}`}
        onClick={e => e.stopPropagation()}
        style={{ transformOrigin: 'bottom right' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800/80 bg-slate-950/40 gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-base leading-snug truncate">{article.title}</h3>
            <div className="flex items-center gap-3 mt-2">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {article.video_type === 'text' ? 'Setup Guide' : (article.video_type || 'TEXT').toUpperCase()}
              </span>
              
              {/* Isolated custom select that triggers hidden Google Translate only for text setup guides */}
              {isTextOnly && (
                <select
                  value={modalLang}
                  onChange={handleLanguageChange}
                  className="bg-slate-850 text-white border border-white/10 rounded-lg px-2 py-0.5 text-[10px] font-bold outline-none cursor-pointer hover:bg-slate-800 transition-colors"
                >
                  <option value="en">English</option>
                  <option value="hi">हिन्दी (Hindi)</option>
                  <option value="mr">मराठी (Marathi)</option>
                  <option value="gu">ગુજરાતી (Gujarati)</option>
                  <option value="bn">বাংলা (Bengali)</option>
                  <option value="ta">தமிழ் (Tamil)</option>
                  <option value="te">తెలుగు (Telugu)</option>
                  <option value="kn">ಕನ್ನಡ (Kannada)</option>
                </select>
              )}
            </div>
          </div>
          <button 
            onClick={handleClose} 
            className="text-slate-400 hover:text-white transition-colors p-2 -mr-2 flex-shrink-0 text-xl font-bold flex items-center justify-center min-w-[44px] min-h-[44px]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Media/Content Area */}
        <div className="bg-slate-950/20">
          {isVideo && (
            <div className="relative" style={{ paddingTop: '56.25%' }}>
              {embedUrl ? (
                <iframe
                  src={embedUrl}
                  title={article.title}
                  className="absolute inset-0 w-full h-full"
                  frameBorder="0"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                  <span className="text-slate-500">Invalid Video URL</span>
                </div>
              )}
            </div>
          )}

          {isImage && (
            <div className="p-4 flex items-center justify-center bg-slate-900" style={{ maxHeight: '450px', overflowY: 'auto' }}>
              <img
                src={getGDriveDirectUrl(article.video_url)}
                alt={article.title}
                className="max-w-full max-h-[400px] object-contain rounded-lg border border-slate-700/40"
                onError={(e) => {
                  e.target.style.display = 'none';
                  const iframe = document.getElementById('image-fallback-iframe');
                  if (iframe) iframe.style.display = 'block';
                }}
              />
              <iframe
                id="image-fallback-iframe"
                src={getGDriveEmbed(article.video_url)}
                title={article.title}
                className="w-full h-[400px] rounded-lg border border-slate-700/40"
                style={{ display: 'none' }}
                frameBorder="0"
              />
            </div>
          )}

          {isAudio && (
            <div className="p-10 flex flex-col items-center justify-center bg-slate-950/50 gap-4">
              <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <Volume2 size={32} />
              </div>
              <audio
                controls
                src={getGDriveDirectUrl(article.video_url)}
                className="w-full max-w-md"
              >
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {isDocument && (
            <div className="w-full h-[450px]">
              {embedUrl ? (
                <iframe
                  src={embedUrl}
                  title={article.title}
                  className="w-full h-full"
                  frameBorder="0"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-800">
                  <span className="text-slate-500">Invalid Document URL</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Description / Instructions */}
        {article.description && (
          <div className="p-5 border-t border-slate-800/80 bg-slate-950/20">
            <h5 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Step-by-step Instructions:</h5>
            <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
              {article.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function KnowledgeBase() {
  const [searchParams, setSearchParams] = useSearchParams();
  const targetModuleAnchor = searchParams.get('module');

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [playingArticle, setPlayingArticle]     = useState(null);
  const [helpOptions, setHelpOptions]           = useState([]);
  const [search, setSearch]                     = useState('');
  const [selectedModule, setSelectedModule]     = useState('all');
  const [selectedFormat, setSelectedFormat]     = useState('all');

  const { role } = useAppStore();
  const userRole = (role || 'admin').toLowerCase();

  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: ['kb_categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_categories')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: articles = [], isLoading: loadingArticles } = useQuery({
    queryKey: ['kb_articles', selectedCategory],
    queryFn: async () => {
      let q = supabase
        .from('kb_articles')
        .select('*, kb_categories(name)')
        .eq('is_published', true)
        .order('sort_order');
      if (selectedCategory) q = q.eq('category_id', selectedCategory);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: true,
  });

  const localArticles = React.useMemo(() => {
    return Object.entries(moduleWalkthroughs).map(([key, value]) => {
      const roleData = value.roles[userRole] || value.roles.admin || {};
      const stepsText = (roleData.steps || []).map(s => `${s.title}\n${s.text}`).join('\n\n');
      const tipsText = roleData.tips ? `\n\nPRO TIPS:\n` + roleData.tips.map(t => `• ${t}`).join('\n') : '';
      const fullText = `${roleData.description || ''}\n\n${stepsText}${tipsText}`;

      return {
        id: `local_${key}`,
        category_id: null,
        title: value.title,
        description: fullText,
        video_type: 'text',
        video_url: null,
        thumbnail_url: null,
        target_module: key,
        is_published: true,
        kb_categories: { name: 'Setup Guide' },
        sort_order: -100
      };
    });
  }, [userRole]);

  const combinedArticles = React.useMemo(() => {
    const list = [...localArticles, ...articles];
    return list.sort((a, b) => {
      const aIsVideo = a.video_type === 'youtube' || a.video_type === 'gdrive';
      const bIsVideo = b.video_type === 'youtube' || b.video_type === 'gdrive';
      
      // Videos first, written guides second
      if (aIsVideo && !bIsVideo) return -1;
      if (!aIsVideo && bIsVideo) return 1;
      
      // Sort by sort_order
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
  }, [localArticles, articles]);

  // Auto-play or show options menu when target module anchor changes
  React.useEffect(() => {
    if (targetModuleAnchor && combinedArticles.length > 0 && !playingArticle && helpOptions.length === 0) {
      const normalizedAnchor = targetModuleAnchor.replace(/-/g, '_');
      const matches = combinedArticles.filter(a => a.target_module && a.target_module.replace(/-/g, '_') === normalizedAnchor);
      
      if (matches.length === 1) {
        setPlayingArticle(matches[0]);
      } else if (matches.length > 1) {
        setHelpOptions(matches);
      }
    }
  }, [targetModuleAnchor, combinedArticles, playingArticle, helpOptions]);

  const clearModuleParam = () => {
    if (searchParams.has('module')) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('module');
      setSearchParams(newParams);
    }
  };

  const handleSelectHelpOption = (article) => {
    setPlayingArticle(article);
    setHelpOptions([]);
  };

  const handleCloseHelpOptions = () => {
    setHelpOptions([]);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('module');
    setSearchParams(newParams);
  };

  const handleClosePlayingArticle = () => {
    setPlayingArticle(null);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('module');
    setSearchParams(newParams);
  };

  const filtered = combinedArticles.filter(a => {
    const matchesSearch = !search || 
      a.title.toLowerCase().includes(search.toLowerCase()) || 
      (a.description && a.description.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory = !selectedCategory || a.category_id === selectedCategory;

    let matchesModule = true;
    if (targetModuleAnchor && !playingArticle) {
      matchesModule = a.target_module && a.target_module.replace(/-/g, '_') === targetModuleAnchor.replace(/-/g, '_');
    } else if (selectedModule !== 'all') {
      matchesModule = a.target_module && a.target_module.replace(/-/g, '_') === selectedModule;
    }

    let matchesFormat = true;
    if (selectedFormat !== 'all') {
      if (selectedFormat === 'video') {
        matchesFormat = a.video_type === 'youtube' || a.video_type === 'gdrive';
      } else if (selectedFormat === 'text') {
        matchesFormat = a.video_type === 'text' || !a.video_url;
      } else {
        matchesFormat = a.video_type === selectedFormat;
      }
    }

    return matchesSearch && matchesCategory && matchesModule && matchesFormat;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <HelpCircle size={26} className="text-indigo-400" /> Help & Tutorials
          </h2>
          <p className="text-sm text-slate-400 mt-1">Step-by-step video tutorials for using the app.</p>
        </div>
      </div>

      {/* Search & Filters Controls */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search tutorials..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2.5 bg-slate-950/40 border border-white/5 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors w-full"
          />
        </div>
        
        {/* Module Filter */}
        <div className="w-full md:w-48">
          <select
            value={selectedModule}
            onChange={e => {
              setSelectedModule(e.target.value);
              clearModuleParam();
            }}
            className="w-full bg-slate-950/40 border border-slate-700/50 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-300 outline-none cursor-pointer focus:border-indigo-500 transition-colors"
          >
            <option value="all">All Modules</option>
            <option value="off_classes">Off-Classes</option>
            <option value="leaves">Leaves</option>
            <option value="complaint_box">Complaint Box</option>
            <option value="emergency">Emergency Alerts</option>
            <option value="billing">Billing & Plan</option>
            <option value="syllabus">Syllabus Tracker</option>
            <option value="bus_alerts">Bus Tracker</option>
            <option value="lost_found">Lost & Found</option>
          </select>
        </div>

        {/* Format Filter */}
        <div className="w-full md:w-48">
          <select
            value={selectedFormat}
            onChange={e => {
              setSelectedFormat(e.target.value);
              clearModuleParam();
            }}
            className="w-full bg-slate-950/40 border border-slate-700/50 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-300 outline-none cursor-pointer focus:border-indigo-500 transition-colors"
          >
            <option value="all">All Formats</option>
            <option value="video">🎥 Video Tutorials</option>
            <option value="text">📖 Setup Handbooks</option>
            <option value="image">🖼️ Infographics / Images</option>
            <option value="audio">🎙️ Audio Guides</option>
            <option value="document">📄 Documents / PDFs</option>
          </select>
        </div>
      </div>

      {/* Category pills */}
      {loadingCats ? (
        <div className="flex gap-2">
          {[1,2,3,4].map(i => <div key={i} className="h-9 w-32 bg-slate-800 rounded-full animate-pulse" />)}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setSelectedCategory(null);
              clearModuleParam();
            }}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${!selectedCategory ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
          >
            All Topics
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.id === selectedCategory ? null : cat.id);
                clearModuleParam();
              }}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${selectedCategory === cat.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Articles Grid */}
      {loadingArticles ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="bg-slate-800 rounded-2xl overflow-hidden animate-pulse">
              <div className="aspect-video bg-slate-700" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-slate-700 rounded w-3/4" />
                <div className="h-3 bg-slate-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
          <p className="font-semibold">{search ? 'No tutorials match your search.' : 'No tutorials available yet.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(article => {
            const getGDriveDirectUrl = (url) => {
              if (!url) return '';
              const idMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || 
                              url.match(/id=([a-zA-Z0-9_-]+)/) ||
                              url.match(/\/d\/([a-zA-Z0-9_-]+)/);
              if (!idMatch) return url;
              return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
            };

            const thumb = article.thumbnail_url
              || (article.video_type === 'image' ? getGDriveDirectUrl(article.video_url) : null)
              || (article.video_type === 'youtube' ? getYouTubeThumbnail(article.video_url) : null);

            const isImage = article.video_type === 'image';
            const isAudio = article.video_type === 'audio';
            const isDocument = article.video_type === 'document';
            const isText = article.video_type === 'text' || !article.video_url;

            const IconComponent = isImage ? Image : isAudio ? Volume2 : isDocument ? FileText : isText ? BookOpen : Play;
            const buttonText = isImage ? 'View Infographic' : isAudio ? 'Listen to Guide' : isDocument ? 'Read Document' : isText ? 'Read Article' : 'Watch Tutorial';

            return (
              <div
                key={article.id}
                onClick={() => setPlayingArticle(article)}
                className="group bg-slate-800/60 border border-slate-700/40 rounded-2xl overflow-hidden cursor-pointer hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-200"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-slate-700 overflow-hidden">
                  {thumb ? (
                    <img src={thumb} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={e => e.target.style.display='none'} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-900/40 to-slate-800">
                      <IconComponent size={40} className="text-indigo-400 opacity-50" />
                    </div>
                  )}
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
                      <IconComponent size={24} className="text-indigo-600 ml-0.5" fill={isText || isDocument ? undefined : "currentColor"} />
                    </div>
                  </div>
                  {/* Badge */}
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-900/80 backdrop-blur-md text-white border border-slate-700/50">
                    {article.video_type === 'youtube' ? 'YouTube' :
                     article.video_type === 'gdrive' ? 'Video' :
                     article.video_type === 'image' ? 'Image' :
                     article.video_type === 'audio' ? 'Audio' :
                     article.video_type === 'document' ? 'Document' : 'Text'}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                      {article.kb_categories?.name}
                    </div>
                    {article.target_module && (
                      <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-900/40 px-1.5 py-0.5 rounded">
                        {article.target_module.replace('_', ' ')}
                      </div>
                    )}
                  </div>
                  <h4 className="font-bold text-white text-sm leading-snug line-clamp-2 group-hover:text-indigo-300 transition-colors">
                    {article.title}
                  </h4>
                  {article.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{article.description}</p>
                  )}
                  <div className="flex items-center gap-1 text-indigo-400 text-xs font-semibold mt-3 group-hover:gap-2 transition-all">
                    <IconComponent size={12} fill={isText || isDocument ? undefined : "currentColor"} /> {buttonText} <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Style Sheet for Emerging & Shrinking Animations */}
      <style>{`
        @keyframes emergeFromHelpButton {
          0% {
            transform: scale(0.1) translate3d(calc(50vw - 24px), calc(50vh - 24px), 0);
            opacity: 0;
          }
          100% {
            transform: scale(1) translate3d(0, 0, 0);
            opacity: 1;
          }
        }
        @keyframes shrinkToHelpButton {
          0% {
            transform: scale(1) translate3d(0, 0, 0);
            opacity: 1;
          }
          100% {
            transform: scale(0.1) translate3d(calc(50vw - 24px), calc(50vh - 24px), 0);
            opacity: 0;
          }
        }
        .animate-emerge {
          animation: emergeFromHelpButton 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .animate-shrink {
          animation: shrinkToHelpButton 0.3s cubic-bezier(0.36, 0.07, 0.19, 0.97) forwards;
        }
      `}</style>

      {/* Help Selection Menu Modal */}
      {helpOptions.length > 0 && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-300"
          onClick={handleCloseHelpOptions}
        >
          <div
            className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl w-full max-w-md my-auto p-6 animate-emerge"
            onClick={e => e.stopPropagation()}
            style={{ transformOrigin: 'bottom right' }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-4">
              <div className="flex items-center gap-2">
                <HelpCircle size={18} className="text-indigo-400" />
                <h4 className="text-xs font-black text-white uppercase tracking-widest">Select Guide Format</h4>
              </div>
              <button 
                onClick={handleCloseHelpOptions} 
                className="text-slate-400 hover:text-white transition-colors p-2 -mr-2 flex items-center justify-center min-w-[44px] min-h-[44px]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            
            <p className="text-xs text-slate-400 mb-4">Multiple learning options are available for this module. Please select your preferred format:</p>
            
            <div className="space-y-3">
              {helpOptions.map(option => {
                const isText = option.video_type === 'text' || !option.video_url;
                const isVideo = option.video_type === 'youtube' || option.video_type === 'gdrive';
                const isImage = option.video_type === 'image';
                const isAudio = option.video_type === 'audio';
                const isDoc = option.video_type === 'document';
                
                let titleText = option.title;
                let subtitleText = "";
                let Icon = Play;
                
                if (isText) {
                  titleText = option.title;
                  subtitleText = "Step-by-step written handbook instructions";
                  Icon = BookOpen;
                } else if (isVideo) {
                  titleText = `Video: ${option.title}`;
                  subtitleText = `Watch visual tutorial (${option.video_type})`;
                  Icon = Play;
                } else if (isImage) {
                  titleText = `Infographic: ${option.title}`;
                  subtitleText = "View diagram & illustrations";
                  Icon = Image;
                } else if (isAudio) {
                  titleText = `Audio Guide: ${option.title}`;
                  subtitleText = "Listen to step-by-step voice guidance";
                  Icon = Volume2;
                } else if (isDoc) {
                  titleText = `Document: ${option.title}`;
                  subtitleText = "Download/Read PDF file";
                  Icon = FileText;
                }

                return (
                  <button
                    key={option.id}
                    onClick={() => handleSelectHelpOption(option)}
                    className="w-full text-left p-4 bg-slate-950/40 hover:bg-indigo-600/10 border border-white/5 hover:border-indigo-500/30 rounded-2xl flex items-center gap-4 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors flex-shrink-0">
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors truncate">{titleText}</div>
                      <div className="text-[10px] text-slate-500 group-hover:text-slate-400 transition-colors truncate mt-0.5">{subtitleText}</div>
                    </div>
                    <ChevronRight size={14} className="text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Media Modal */}
      {playingArticle && <MediaModal article={playingArticle} onClose={handleClosePlayingArticle} />}
    </div>
  );
}
