import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../config/supabaseClient';
import { useAppStore } from '../store/useAppStore';
import { 
  HelpCircle, BookOpen, Play, Image, Volume2, FileText, ChevronRight, X 
} from 'lucide-react';
import { moduleWalkthroughs } from '../config/moduleWalkthroughs';

// ─── GDrive / YouTube helpers ───────────────────────────────────────────────
function getYouTubeEmbed(url) {
  if (!url) return null;
  const idMatch = url.match(/youtu\.be\/([^?&]+)/) || url.match(/[?&]v=([^?&]+)/) || url.match(/youtube\.com\/embed\/([^?&]+)/);
  return idMatch ? `https://www.youtube.com/embed/${idMatch[1]}?autoplay=1` : null;
}

function getGDriveEmbed(url) {
  if (!url) return null;
  const idMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return idMatch ? `https://drive.google.com/file/d/${idMatch[1]}/preview` : url;
}

// ─── Media Player Modal ─────────────────────────────────────────────────────
function MediaModal({ article, onClose, role, navigate }) {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const getGDriveDirectUrl = (url) => {
    if (!url) return '';
    const idMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    return idMatch ? `https://drive.google.com/uc?export=download&id=${idMatch[1]}` : url;
  };

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

  const isVideo = article.video_type === 'youtube' || article.video_type === 'gdrive';
  const isImage = article.video_type === 'image';
  const isAudio = article.video_type === 'audio';
  const isDocument = article.video_type === 'document';
  const isTextOnly = article.video_type === 'text' || !article.video_url;

  let embedUrl = null;
  if (isVideo) {
    embedUrl = article.video_type === 'youtube' ? getYouTubeEmbed(article.video_url) : getGDriveEmbed(article.video_url);
  } else if (isDocument) {
    embedUrl = getGDriveEmbed(article.video_url);
  }

  return (
    <div
      className={`fixed inset-0 z-[250] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-y-auto transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
      onClick={handleClose}
    >
      <div
        id="translate-help-modal-content"
        className={`bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl w-full max-w-3xl my-auto ${isClosing ? 'animate-shrink' : 'animate-emerge'}`}
        onClick={e => e.stopPropagation()}
        style={{ transformOrigin: 'bottom right' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-950/40 gap-4">
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
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                handleClose();
                navigate(`/${role}/knowledge-base`);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 rounded-xl text-[10px] font-bold transition-all active:scale-95"
              title="Open Full Help Center"
            >
              <BookOpen size={12} />
              <span>All Tutorials</span>
            </button>
            <button 
              onClick={handleClose} 
              className="text-slate-400 hover:text-white transition-colors p-2 -mr-2 flex-shrink-0 text-xl font-bold flex items-center justify-center min-w-[44px] min-h-[44px]"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
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
          <div className="p-5 border-t border-slate-800/80 bg-slate-950/20 max-h-[60vh] overflow-y-auto">
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

// ─── Main HelpButton Component ─────────────────────────────────────────────
export default function HelpButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAppStore();

  const [playingArticle, setPlayingArticle] = useState(null);
  const [helpOptions, setHelpOptions] = useState(false);
  const [activeOptionsList, setActiveOptionsList] = useState([]);
  const [isClosingOptions, setIsClosingOptions] = useState(false);

  // Don't show on login/register/reset-password pages or inside the help module itself
  const isHiddenPage = useMemo(() => {
    return !role || 
      ['/login', '/register', '/reset-password'].includes(location.pathname) || 
      location.pathname.includes('/knowledge-base') || 
      location.pathname.includes('/platform-admin');
  }, [role, location.pathname]);

  // Fetch db articles globally to filter client-side for immediate overlays
  const { data: articles = [] } = useQuery({
    queryKey: ['kb_articles_global'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kb_articles')
        .select('*, kb_categories(name)')
        .eq('is_published', true)
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
    enabled: !isHiddenPage,
  });

  // Load and segment local walkthrough guides based on role
  const localArticles = useMemo(() => {
    const userRole = (role || 'admin').toLowerCase();
    return Object.entries(moduleWalkthroughs).map(([key, value]) => {
      const roleData = value.roles[userRole] || value.roles.admin || {};
      const stepsText = (roleData.steps || []).map(s => `${s.title}\n${s.text}`).join('\n\n');
      const tipsText = roleData.tips ? `\n\nPRO TIPS:\n` + roleData.tips.map(t => `• ${t}`).join('\n') : '';
      const fullText = `${roleData.description || ''}\n\n${stepsText}${tipsText}`;

      return {
        id: `local_${key}`,
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
  }, [role]);

  const combinedArticles = useMemo(() => {
    return [...localArticles, ...articles];
  }, [localArticles, articles]);

  // Extract active module name from URL path
  const segments = location.pathname.split('/').filter(Boolean);
  const currentModuleRaw = segments.length > 1 ? segments[1] : 'none';
  const currentModule = currentModuleRaw.replace(/-/g, '_');

  // Trigger onboarding on first visit to a module
  useEffect(() => {
    if (isHiddenPage || currentModule === 'none' || combinedArticles.length === 0) return;

    const key = `onboarding_completed_${currentModule}`;
    const completed = localStorage.getItem(key);

    if (!completed) {
      // Find matching items for the current module
      const matches = combinedArticles.filter(a => a.target_module && a.target_module.replace(/-/g, '_') === currentModule);
      
      if (matches.length === 1) {
        setPlayingArticle(matches[0]);
      } else if (matches.length > 1) {
        setActiveOptionsList(matches);
        setHelpOptions(true);
      }
      
      // Save flag to avoid auto-popping on next page refreshes
      localStorage.setItem(key, 'true');
    }
  }, [currentModule, combinedArticles, isHiddenPage]);

  if (isHiddenPage) return null;

  const handleHelpClick = () => {
    if (currentModule && currentModule !== 'none') {
      const matches = combinedArticles.filter(a => a.target_module && a.target_module.replace(/-/g, '_') === currentModule);
      if (matches.length === 1) {
        setPlayingArticle(matches[0]);
      } else if (matches.length > 1) {
        setActiveOptionsList(matches);
        setHelpOptions(true);
      } else {
        navigate(`/${role}/knowledge-base`);
      }
    } else {
      navigate(`/${role}/knowledge-base`);
    }
  };

  const handleSelectHelpOption = (article) => {
    setPlayingArticle(article);
    setHelpOptions(false);
    setActiveOptionsList([]);
  };

  const handleCloseHelpOptions = () => {
    setIsClosingOptions(true);
    setTimeout(() => {
      setHelpOptions(false);
      setIsClosingOptions(false);
      setActiveOptionsList([]);
    }, 300);
  };

  const handleClosePlayingArticle = () => {
    setPlayingArticle(null);
  };

  return (
    <>
      {/* Styles for emerge and shrink animations */}
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
        
        /* Hide google translate top frame & customize simple widget style */
        .goog-te-banner-frame {
          display: none !important;
        }
        body {
          top: 0px !important;
        }
        .google-translate-modal-widget select {
          background-color: rgb(30, 41, 59) !important;
          color: white !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 8px !important;
          padding: 3px 8px !important;
          font-size: 11px !important;
          outline: none !important;
          cursor: pointer !important;
        }
        .google-translate-modal-widget .goog-te-gadget {
          color: transparent !important;
          font-size: 0px !important;
        }
        .google-translate-modal-widget .goog-te-gadget span {
          display: none !important;
        }
      `}</style>

      {/* Floating help button */}
      <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-500">
        <button 
          onClick={handleHelpClick}
          title="Need Help? View Tutorials"
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-[0_8px_30px_rgb(79,70,229,0.4)] px-4 py-3 rounded-full font-black text-sm tracking-wide transition-all hover:scale-105 active:scale-95 border border-white/10 group"
        >
          <HelpCircle size={20} className="group-hover:rotate-12 transition-transform duration-300" />
          <span className="hidden sm:inline">Help / Tutorials</span>
        </button>
      </div>

      {/* Choice List Selection Modal */}
      {helpOptions && activeOptionsList.length > 0 && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={handleCloseHelpOptions}
        >
          <div
            className={`bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl w-full max-w-md my-auto p-6 ${isClosingOptions ? 'animate-shrink' : 'animate-emerge'}`}
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
              {activeOptionsList.map(option => {
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
      {playingArticle && <MediaModal article={playingArticle} onClose={handleClosePlayingArticle} role={role} navigate={navigate} />}
    </>
  );
}
