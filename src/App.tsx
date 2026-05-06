import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Type, 
  Loader2, 
  X, 
  Maximize2, 
  Copy, 
  Check,
  FileText,
  Layers,
  Sparkles,
  Zap,
  ShieldCheck,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type as GeminiType } from "@google/genai";
import { cn } from './lib/utils';

interface OCRResult {
  text: string;
  translatedText?: string;
  bgColor?: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
  confidence: number;
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [results, setResults] = useState<OCRResult[]>([]);
  const [fullText, setFullText] = useState<string>('');
  const [translatedText, setTranslatedText] = useState<string>('');
  const [viewMode, setViewMode] = useState<'original' | 'translated'>('translated');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [errorHeader, setErrorHeader] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showOverlays, setShowOverlays] = useState(true);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const processImage = useCallback(async (imageUrl: string, overrideDimensions?: { width: number, height: number }) => {
    setLoading(true);
    setProgress(20);
    setStatus('Analyzing image context...');
    setResults([]);
    setFullText('');
    setTranslatedText('');

    // Use passed dimensions if available, otherwise fallback to state
    const currentDimensions = overrideDimensions || imageDimensions;

    try {
      if (!process.env.GEMINI_API_KEY) {
        const msg = 'API Key Missing. Please set GEMINI_API_KEY in Settings.';
        setStatus(msg);
        setErrorHeader(msg);
        throw new Error(msg);
      }
      setErrorHeader(null);

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const base64Data = imageUrl.split(',')[1];
      
      setProgress(50);
      setStatus('Translating content...');

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data,
                },
              },
              {
                text: "Perform extremely accurate OCR on this image focusing on Simplified Chinese. \n" +
                      "1. Extract all original Chinese text as 'fullText'.\n" +
                      "2. Translate the full text into natural, professional English as 'translatedText'.\n" +
                      "3. Identify each distinct text area (like speech bubbles, captions, or paragraphs) as a 'textBlock'. \n" +
                      "For each 'textBlock', provide the original Chinese 'text', its English 'translatedText', and its 'bbox' as [ymin, xmin, ymax, xmax] in normalized coordinates (0-1000).\n" +
                      "Return the result as a strict JSON object following the provided schema.",
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: GeminiType.OBJECT,
            properties: {
              fullText: { type: GeminiType.STRING },
              translatedText: { type: GeminiType.STRING },
              textBlocks: {
                type: GeminiType.ARRAY,
                items: {
                  type: GeminiType.OBJECT,
                  properties: {
                    text: { type: GeminiType.STRING },
                    translatedText: { type: GeminiType.STRING },
                    bbox: { 
                      type: GeminiType.ARRAY, 
                      items: { type: GeminiType.NUMBER },
                      description: "[ymin, xmin, ymax, xmax] in 0-1000 normalized range"
                    }
                  },
                  required: ["text", "translatedText", "bbox"]
                }
              }
            },
            required: ["fullText", "translatedText", "textBlocks"]
          }
        }
      });

      // Clean response text in case of markdown blocks
      let cleanText = response.text || '';
      if (cleanText.includes('```json')) {
        cleanText = cleanText.split('```json')[1].split('```')[0].trim();
      } else if (cleanText.includes('```')) {
        cleanText = cleanText.split('```')[1].split('```')[0].trim();
      }
      
      const result = JSON.parse(cleanText || '{}');
      
      if (!result.fullText && !result.textBlocks) {
        throw new Error('Vision AI returned an empty or invalid response structure');
      }

      setFullText(result.fullText || '');
      setTranslatedText(result.translatedText || '');
      
      if (result.translatedText) {
        setViewMode('translated');
      }
      
      // Convert normalized 0-1000 coordinates to absolute pixels
      const blocks = result.textBlocks || result.words || [];
      if (blocks.length > 0 && currentDimensions.width > 0) {
        const ocrResults: OCRResult[] = blocks.map((w: any) => ({
          text: w.text,
          translatedText: w.translatedText,
          confidence: 100,
          bbox: {
            x0: (w.bbox[1] / 1000) * currentDimensions.width,
            y0: (w.bbox[0] / 1000) * currentDimensions.height,
            x1: (w.bbox[3] / 1000) * currentDimensions.width,
            y1: (w.bbox[2] / 1000) * currentDimensions.height,
          }
        }));

        // After setting results, if image is already loaded, sample colors immediately
        if (imageRef.current && imageRef.current.complete) {
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          
          const enrichedWithColors = ocrResults.map(res => {
            if (ctx && imageRef.current) {
              // Sample just below the box to get background color without text interference
              const sampleX = res.bbox.x0 + (res.bbox.x1 - res.bbox.x0) / 2;
              const sampleY = Math.min(res.bbox.y1 + 10, currentDimensions.height - 1);
              ctx.drawImage(imageRef.current, sampleX, sampleY, 1, 1, 0, 0, 1, 1);
              const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
              return { ...res, bgColor: `rgb(${r}, ${g}, ${b})` };
            }
            return res;
          });
          setResults(enrichedWithColors);
        } else {
          setResults(ocrResults);
        }
      } else if (blocks.length === 0) {
        console.warn('No text blocks returned from Vision AI');
      }
      
      setProgress(100);
      setStatus('Completed');
    } catch (error) {
      console.error('Vision AI Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Error: ${errorMessage}`);
      setErrorHeader(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [imageDimensions]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setImage(url);
        const img = new Image();
        img.onload = () => {
          const dims = { width: img.naturalWidth, height: img.naturalHeight };
          setImageDimensions(dims);
          processImage(url, dims);
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setImage(url);
        const img = new Image();
        img.onload = () => {
          const dims = { width: img.naturalWidth, height: img.naturalHeight };
          setImageDimensions(dims);
          processImage(url, dims);
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    }
  };

  const retryOCR = () => {
    if (image) {
      processImage(image);
    }
  };

  // Re-run if dimensions change (initial load)
  useEffect(() => {
    if (image && imageDimensions.width > 0 && results.length === 0 && !loading) {
      // Small delay to ensure state settling if needed
    }
  }, [imageDimensions, image, results.length, loading]);

  const copyToClipboard = () => {
    const textToCopy = viewMode === 'translated' ? translatedText : fullText;
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setImageDimensions({ width: naturalWidth, height: naturalHeight });

    // Sample colors if results exist but don't have bgColors
    if (results.length > 0 && results.some(r => !r.bgColor)) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      const enrichedResults = results.map(res => {
        if (ctx && imageRef.current && !res.bgColor) {
          // Sample just below the box to get background color without text interference
          const sampleX = res.bbox.x0 + (res.bbox.x1 - res.bbox.x0) / 2;
          const sampleY = Math.min(res.bbox.y1 + 10, imageDimensions.height - 1);
          ctx.drawImage(imageRef.current, sampleX, sampleY, 1, 1, 0, 0, 1, 1);
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
          return { ...res, bgColor: `rgb(${r}, ${g}, ${b})` };
        }
        return res;
      });
      setResults(enrichedResults);
    }
  };

  const reset = () => {
    setImage(null);
    setResults([]);
    setFullText('');
    setTranslatedText('');
    setViewMode('original');
    setProgress(0);
    setStatus('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1a1a1a] font-sans selection:bg-orange-100 selection:text-orange-900">
      {/* Error Header */}
      {errorHeader && (
        <div className="fixed bottom-6 right-6 z-[100] max-w-sm">
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-lg flex items-start gap-3"
          >
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-red-500 shrink-0">
              <X size={16} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-red-900">Translation Error</h4>
              <p className="text-xs text-red-700 mt-1 line-clamp-3">{errorHeader}</p>
            </div>
            <button onClick={() => setErrorHeader(null)} className="text-red-400 hover:text-red-600">
              <X size={14} />
            </button>
          </motion.div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white shadow-sm shadow-orange-200">
              <Type size={18} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">VisionText <span className="text-orange-500 font-bold italic">CN</span></h1>
          </div>
          
          <div className="flex items-center gap-4">
            {image && (
              <button 
                onClick={copyToClipboard}
                disabled={viewMode === 'original' ? !fullText : !translatedText}
                className={cn(
                  "flex items-center gap-2 text-sm font-medium transition-colors",
                  isCopied ? "text-green-500" : "text-gray-400 hover:text-orange-500"
                )}
                title="Copy current view text"
              >
                {isCopied ? <Check size={16} /> : <Copy size={16} />}
                <span className="hidden sm:inline">{isCopied ? 'Copied' : 'Copy'}</span>
              </button>
            )}

            {image && (
              <button 
                onClick={reset}
                className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-red-500 transition-colors"
                id="reset-btn"
              >
                <X size={16} />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <AnimatePresence mode="wait">
          {!image ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mt-12"
              id="upload-container"
            >
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="group relative border-2 border-dashed border-gray-200 rounded-3xl p-16 flex flex-col items-center justify-center gap-6 bg-white hover:border-orange-400 hover:bg-orange-50/10 transition-all cursor-pointer"
              >
                <div className="w-20 h-20 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-orange-100 group-hover:text-orange-500 transition-colors">
                  <Upload size={32} />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-medium mb-1">Upload an image to scan Simplified Chinese</h3>
                  <p className="text-sm text-gray-400">Drag and drop or click to select a file</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={onFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
              
              <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
                <FeatureCard 
                  icon={<Sparkles size={20} className="text-orange-500" />}
                  title="Nuanced Recognition"
                  description="Powered by Gemini Pro Vision to handle complex layouts, stylized fonts, and handwriting."
                />
                <FeatureCard 
                  icon={<ShieldCheck size={20} className="text-blue-500" />}
                  title="Context Aware"
                  description="Understands character context for superior accuracy in Simplified Chinese recognition."
                />
                <FeatureCard 
                  icon={<Maximize2 size={20} className="text-green-500" />}
                  title="Precise Mapping"
                  description="Visualize exactly where text is detected with interactive AI-driven bounding box overlays."
                />
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col gap-8 w-full"
              id="results-container"
            >
              {/* Image Preview Overlay Section */}
              <div className="space-y-4 w-full">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden relative group">
                  <div className="absolute top-4 right-4 z-10 flex gap-2">
                    <button
                      onClick={retryOCR}
                      disabled={loading}
                      className="p-2 rounded-lg bg-white/80 backdrop-blur-md text-gray-700 shadow-sm hover:bg-white transition-all disabled:opacity-50"
                      title="Retry OCR"
                    >
                      <Zap size={14} className={cn(loading && "animate-pulse")} />
                    </button>
                    <button
                      onClick={() => setShowOverlays(!showOverlays)}
                      className={cn(
                        "p-2 rounded-lg backdrop-blur-md transition-all flex items-center gap-2 text-xs font-medium",
                        showOverlays 
                          ? "bg-white text-orange-500 shadow-lg shadow-orange-100" 
                          : "bg-white/80 text-gray-400 shadow-sm"
                      )}
                      title="Toggle text overlays"
                    >
                      {showOverlays ? <Layers size={14} /> : <Eye size={14} />}
                      {showOverlays ? 'Hide Box' : 'Show Box'}
                    </button>
                  </div>

                  {loading && (
                    <div className="absolute inset-0 z-20 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
                      <div className="w-full max-w-xs space-y-4">
                        <div className="relative">
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              className="h-full bg-orange-500"
                            />
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-orange-600 uppercase tracking-widest flex items-center justify-center gap-2">
                            <Loader2 size={16} className="animate-spin" />
                            {status}
                          </p>
                          <p className="text-xs text-gray-400 mt-2">{progress}% complete</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="relative bg-gray-50">
                    <div className="flex items-center justify-center relative p-4 sm:p-8">
                      <div className="relative">
                        <img 
                          ref={imageRef}
                          src={image} 
                          alt="OCR Source" 
                          className="max-w-full h-auto shadow-xl"
                          onLoad={handleImageLoad}
                        />
                        
                        {/* OCR Bounding Boxes */}
                        {showOverlays && !loading && results.length > 0 && imageDimensions.width > 0 && (
                          <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                            {results.map((res, i) => {
                              const scaleX = (imageRef.current?.clientWidth || 0) / imageDimensions.width;
                              const scaleY = (imageRef.current?.clientHeight || 0) / imageDimensions.height;
                              
                              const width = (res.bbox.x1 - res.bbox.x0) * scaleX;
                              const height = (res.bbox.y1 - res.bbox.y0) * scaleY;
                              const left = res.bbox.x0 * scaleX;
                              const top = res.bbox.y0 * scaleY;

                              return (
                                <div 
                                  key={i}
                                  className={cn(
                                    "absolute transition-all pointer-events-auto flex items-center justify-center",
                                    viewMode === 'original' 
                                      ? "border border-orange-500/30 bg-orange-500/10 hover:border-orange-500/60 cursor-help rounded-sm" 
                                      : "border-none"
                                  )}
                                  title={viewMode === 'original' ? `${res.text}` : `${res.translatedText}`}
                                  style={{
                                    left,
                                    top,
                                    width,
                                    height,
                                    backgroundColor: viewMode === 'translated' ? (res.bgColor || 'white') : undefined,
                                  }}
                                >
                                  {viewMode === 'translated' && res.translatedText && (
                                    <div 
                                      className="w-[70.7%] h-[70.7%] flex items-center justify-center overflow-hidden"
                                      style={{ backgroundColor: res.bgColor || 'white' }}
                                    >
                                      <span 
                                        className="leading-tight text-orange-950 font-black text-center break-words hyphens-auto uppercase tracking-tighter"
                                        style={{ fontSize: `${Math.min(height * 0.5, 14)}px` }}
                                      >
                                        {res.translatedText}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-400 font-medium px-2">
                  <div className="flex items-center gap-1.5">
                    <ImageIcon size={14} />
                    {imageDimensions.width} × {imageDimensions.height} px
                  </div>
                  <div className="flex items-center gap-1.5">
                    <FileText size={14} />
                    {results.length} blocks detected
                  </div>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>
      </main>
      
      {/* Background Decor */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-orange-100/30 rounded-full blur-3xl opacity-50" />
        <div className="absolute top-1/2 -left-24 w-72 h-72 bg-blue-100/20 rounded-full blur-3xl opacity-30" />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center mb-4">
        {icon}
      </div>
      <h4 className="font-semibold mb-1">{title}</h4>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}
