import React from 'react';
import { Image as ImageIcon, Wrench } from 'lucide-react';

export default function GalleryManager() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text tracking-tight flex items-center gap-2">
            <ImageIcon className="text-pink-500" size={28} /> Memory Gallery
          </h2>
          <p className="text-sm text-muted">Browse through school events, activities, and milestones.</p>
        </div>
      </div>

      {/* Empty / Placeholder State */}
      <div className="bg-white border-2 border-dashed border-border rounded-3xl p-12 text-center shadow-sm flex flex-col items-center justify-center fade-in">
        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
           <Wrench size={40} className="text-slate-400" />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">Gallery Module Under Construction</h3>
        <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
          We are completely rebuilding the Gallery module to provide a faster, more reliable, and seamless photo management experience. Please check back later!
        </p>
      </div>
    </div>
  );
}
