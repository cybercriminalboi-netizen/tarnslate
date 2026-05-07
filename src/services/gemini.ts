import { GoogleGenAI, Type as GeminiType } from "@google/genai";

export interface OCRResult {
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

export interface TranslationResponse {
  fullText: string;
  translatedText: string;
  results: OCRResult[];
}

export async function translateMangaImage(
  imageUrl: string, 
  apiKey: string, 
  modelName: string,
  dimensions: { width: number, height: number }
): Promise<TranslationResponse> {
  const ai = new GoogleGenAI({ apiKey });
  const base64Data = imageUrl.split(',')[1];
  
  const response = await ai.models.generateContent({
    model: modelName,
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
            text: "Perform extremely accurate OCR on this image focusing only on the text characters within Simplified Chinese speech bubbles and captions.\n" +
                  "1. Identify every individual text block. Extract the original Chinese text.\n" +
                  "2. Provide a TIGHT 'bbox' as [ymin, xmin, ymax, xmax] in normalized coordinates (0-1000) that encloses ONLY the text characters. Do NOT include the speech bubble borders or background empty space.\n" +
                  "3. Translate the text naturally into English.\n" +
                  "4. Provide a 'fullText' transcription and a 'translatedText' summary.\n" +
                  "Return only strict JSON.",
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

  let cleanText = response.text || '';
  if (cleanText.includes('```json')) {
    cleanText = cleanText.split('```json')[1].split('```')[0].trim();
  } else if (cleanText.includes('```')) {
    cleanText = cleanText.split('```')[1].split('```')[0].trim();
  }
  
  const result = JSON.parse(cleanText || '{}');
  
  if (!result.fullText && !result.textBlocks) {
    throw new Error('Vision AI failed to identify text blocks.');
  }

  const blocks = result.textBlocks || [];
  const ocrResults: OCRResult[] = blocks.map((w: any) => ({
    text: w.text,
    translatedText: w.translatedText,
    confidence: 100,
    bgColor: 'white',
    bbox: {
      x0: (w.bbox[1] / 1000) * dimensions.width,
      y0: (w.bbox[0] / 1000) * dimensions.height,
      x1: (w.bbox[3] / 1000) * dimensions.width,
      y1: (w.bbox[2] / 1000) * dimensions.height,
    }
  }));

  return {
    fullText: result.fullText || '',
    translatedText: result.translatedText || '',
    results: ocrResults
  };
}
