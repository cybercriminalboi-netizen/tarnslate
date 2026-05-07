import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { translateMangaImage, OCRResult } from '../services/gemini';
import { getStorage } from '../lib/storage';

export const FloatingUI = () => {
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<Record<string, OCRResult[]>>({});

  const translatePageImages = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // 1. Get API Key and Model from cross-domain storage
      const apiKey = await getStorage('GEMINI_API_KEY') || '';
      const model = await getStorage('GEMINI_SELECTED_MODEL') || 'gemini-2.0-flash';
      
      if (!apiKey) throw new Error('API Key missing. Open extension settings to set it.');

      // 2. Find images currently in view
      const images = Array.from(document.querySelectorAll('img')).filter(img => {
        const rect = img.getBoundingClientRect();
        return rect.width > 200 && rect.height > 200; // Only translate larger manga-sized images
      });

      if (images.length === 0) throw new Error('No manga images found on page.');

      for (const img of images) {
        // Convert image to base64 if possible
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        
        try {
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg');
          
          const result = await translateMangaImage(
            dataUrl, 
            apiKey, 
            model, 
            { width: img.naturalWidth, height: img.naturalHeight }
          );

          // Add overlays to the image parent or image itself
          injectOverlaysToImage(img, result.results);
        } catch (e) {
          console.error('Failed to capture image:', e);
        }
      }
      
      setActive(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const injectOverlaysToImage = (img: HTMLImageElement, results: OCRResult[]) => {
    // We create a container that wraps the image
    const parent = img.parentElement;
    if (!parent) return;

    // Remove existing overlays
    const existing = parent.querySelectorAll('.manga-translator-overlay');
    existing.forEach(e => e.remove());

    const container = document.createElement('div');
    container.className = 'manga-translator-overlay';
    container.style.position = 'absolute';
    container.style.top = img.offsetTop + 'px';
    container.style.left = img.offsetLeft + 'px';
    container.style.width = img.clientWidth + 'px';
    container.style.height = img.clientHeight + 'px';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '1000';

    parent.style.position = 'relative';
    parent.appendChild(container);

    results.forEach(res => {
      const scaleX = img.clientWidth / img.naturalWidth;
      const scaleY = img.clientHeight / img.naturalHeight;

      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.left = (res.bbox.x0 * scaleX) + 'px';
      overlay.style.top = (res.bbox.y0 * scaleY) + 'px';
      overlay.style.width = ((res.bbox.x1 - res.bbox.x0) * scaleX) + 'px';
      overlay.style.height = ((res.bbox.y1 - res.bbox.y0) * scaleY) + 'px';
      overlay.style.backgroundColor = 'white';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.padding = '2px';
      overlay.style.overflow = 'hidden';

      const text = document.createElement('span');
      text.textContent = res.translatedText || '';
      text.style.color = '#111827';
      text.style.fontWeight = 'bold';
      text.style.textAlign = 'center';
      text.style.fontSize = Math.max(6, Math.min(((res.bbox.y1 - res.bbox.y0) * scaleY) * 0.5, 14)) + 'px';
      text.style.lineHeight = '1.1';
      text.style.textTransform = 'uppercase';

      overlay.appendChild(text);
      container.appendChild(overlay);
    });
  };

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{
              position: 'absolute',
              bottom: '70px',
              right: '0',
              width: '240px',
              background: '#fee2e2',
              color: '#991b1b',
              padding: '12px',
              borderRadius: '12px',
              fontSize: '12px',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
              border: '1px solid #fecaca'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>Error</strong>
              <X size={14} style={{ cursor: 'pointer' }} onClick={() => setError(null)} />
            </div>
            <p style={{ margin: '4px 0 0' }}>{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={translatePageImages}
        disabled={loading}
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '28px',
          background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
          border: 'none',
          cursor: loading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 25px rgba(234, 88, 12, 0.4)',
          color: 'white'
        }}
      >
        {loading ? (
          <Loader2 className="animate-spin" size={24} />
        ) : active ? (
          <RefreshCw size={24} />
        ) : (
          <Sparkles size={24} />
        )}
      </motion.button>
    </div>
  );
};
