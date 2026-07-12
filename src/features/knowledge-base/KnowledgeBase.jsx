import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../config/supabaseClient';
import { BookOpen, Play, ExternalLink, ChevronRight, Loader2, Search, HelpCircle, Image, Volume2, FileText, X } from 'lucide-react';
import { moduleWalkthroughs } from '../../config/moduleWalkthroughs';
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
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden shadow-2xl w-full max-w-3xl my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800/80 bg-slate-950/40">
          <div>
            <h3 className="font-bold text-white text-base leading-snug">{article.title}</h3>
            <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {article.video_type ? article.video_type.toUpperCase() : 'TEXT'} Tutorial
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors ml-4 flex-shrink-0 text-lg">✕</button>
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
  const [searchParams] = useSearchParams();
  const targetModuleAnchor = searchParams.get('module');

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [playingArticle, setPlayingArticle]     = useState(null);
  const [search, setSearch]                     = useState('');

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
      const stepsText = value.steps.map(s => `${s.title}\n${s.text}`).join('\n\n');
      const tipsText = value.tips ? `\n\nPRO TIPS:\n` + value.tips.map(t => `• ${t}`).join('\n') : '';
      const fullText = `${value.description}\n\n${stepsText}${tipsText}`;

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
        kb_categories: { name: 'Local Guide' },
        sort_order: -100
      };
    });
  }, []);

  const combinedArticles = React.useMemo(() => {
    return [...localArticles, ...articles];
  }, [localArticles, articles]);

  // Auto-play the targeted module video if present in URL
  React.useEffect(() => {
    if (targetModuleAnchor && combinedArticles.length > 0 && !playingArticle) {
      const normalizedAnchor = targetModuleAnchor.replace(/-/g, '_');
      const match = combinedArticles.find(a => a.target_module && a.target_module.replace(/-/g, '_') === normalizedAnchor);
      if (match) {
        setPlayingArticle(match);
        if (match.category_id) {
          setSelectedCategory(match.category_id);
        }
      }
    }
  }, [targetModuleAnchor, combinedArticles, playingArticle]);

  const filtered = combinedArticles.filter(a =>
    (!search || a.title.toLowerCase().includes(search.toLowerCase()) || a.description?.toLowerCase().includes(search.toLowerCase())) &&
    (!targetModuleAnchor || playingArticle || (a.target_module && a.target_module.replace(/-/g, '_') === targetModuleAnchor.replace(/-/g, '_')) || !selectedCategory)
  );

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
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search tutorials..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors w-64"
          />
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
            onClick={() => setSelectedCategory(null)}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${!selectedCategory ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
          >
            All Topics
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
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

      {/* Media Modal */}
      {playingArticle && <MediaModal article={playingArticle} onClose={() => setPlayingArticle(null)} />}
    </div>
  );
}
