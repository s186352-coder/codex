import React, { useState, useRef } from 'react';
import {
  Camera,
  Zap,
  Image as ImageIcon,
  Sparkles,
  Layers,
  Sliders,
  X,
  Download,
  Wand2,
  Upload,
  Trash2,
  RefreshCw,
  MessageSquare,
  Shirt,
  User
} from 'lucide-react';

const ArtDarkroom = () => {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState(
    "low quality, ugly, deformed, blurry, bad anatomy, disfigured, text, watermark, lowres, bad hands, missing limbs, extra fingers, mutated"
  );
  const [generatedImage, setGeneratedImage] = useState(null);

  // Dual Image State
  const [baseImage, setBaseImage] = useState(null); // Image 1: Composition/Subject
  const [materialImage, setMaterialImage] = useState(null); // Image 2: Clothing/Texture Reference

  const [isLoading, setIsLoading] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState(null);

  const baseInputRef = useRef(null);
  const materialInputRef = useRef(null);

  // Custom preferences
  const [settings, setSettings] = useState({
    skinGloss: 85,
    legLength: 95,
    bustSize: 'voluptuous',
    // shoes: 'glass_heels', // Removed per user request
    style: 'anime_bold'
  });

  const apiKey = ""; // System provided runtime key

  const modifiers = {
    skin: "hyper-realistic glossy skin, wet skin texture, oil shiny skin, subsurface scattering, bright white complexion",
    body: "voluptuous figure, hourglass body, heavy chest, extremely detailed cleavage",
    legs: "extremely long legs, endless legs, perfect leg ratio, thigh gap, model stature",
    // shoes modifier removed to allow full user control
    style:
      "masterpiece, best quality, bold artistic composition, dynamic angle, cinematic lighting, 8k resolution, anime style, cel shaded mixed with realistic texture"
  };

  // Generic uploader
  const handleUpload = (e, setFunc, clearAnalysis = true) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFunc(reader.result);
        if (clearAnalysis) setAnalysisResult(null);
      };
      reader.readAsDataURL(file);
    }
  };

  // Feature 1: AI Prompt Enhancer
  const enhancePrompt = async () => {
    if (!prompt && !baseImage) return; // Allow enhancing if at least base image is there (to describe it)
    setIsEnhancing(true);
    try {
      const systemInstruction = `
        You are an AI Art Director. 
        User provides a short description or just an image context. 
        Generate a detailed Stable Diffusion prompt for "High-Gloss Anime Style".
        Mandatory: Cinematic lighting, detailed glossy skin, confident expression.
        Do NOT force any specific shoes unless user mentions them.
        Output ONLY the prompt text.
      `;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `User Input: ${prompt || "Describe a beautiful anime female in a bold pose"}` }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] }
          })
        }
      );

      const data = await response.json();
      const enhancedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (enhancedText) setPrompt(enhancedText.trim());
    } catch (err) {
      console.error(err);
    } finally {
      setIsEnhancing(false);
    }
  };

  // Feature 2: AI Art Critic
  const analyzeImage = async (targetImg) => {
    const imgToAnalyze = targetImg || generatedImage;
    if (!imgToAnalyze) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const base64Data = imgToAnalyze.split(',')[1];
      const mimeType = imgToAnalyze.substring(imgToAnalyze.indexOf(':') + 1, imgToAnalyze.indexOf(';'));

      const promptText = `
        As a glamour photography critic, analyze this image.
        Focus on: 1. Skin gloss/texture. 2. Leg proportion/Pose. 3. Outfit/Shoe details as presented.
        Tone: Professional, artistic, slightly bold.
        Language: Traditional Chinese (繁體中文).
        Max 50 words.
      `;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: promptText },
                  { inlineData: { mimeType: mimeType, data: base64Data } }
                ]
              }
            ]
          })
        }
      );

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) setAnalysisResult(text);
    } catch (err) {
      setAnalysisResult("鑑賞服務連線逾時，請稍後再試。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Core Generation Logic
  const generateImage = async () => {
    if (!baseImage && !materialImage && !prompt) {
      setError("請至少上傳一張圖片或輸入指令。");
      return;
    }

    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);

    try {
      let fullPrompt = "";
      let mode = "";

      // Construct Prompt based on combination
      if (baseImage && materialImage) {
        mode = "Dual Fusion";
        fullPrompt = `
          Task: Image Synthesis and Restyling.
          [Image 1] is the COMPOSITION BASE (Pose, Anatomy, Angle).
          [Image 2] is the CLOTHING/MATERIAL REFERENCE (Outfit, Shoes, Textures).
          
          Action:
          1. Strictly maintain the pose and body structure of [Image 1].
          2. Dress the character in the specific items shown in [Image 2]. Replace original clothes.
          3. Apply style: ${modifiers.style}, High-Gloss Anime Art.
          4. Features: ${prompt || "Beautiful female solo, confident expression"}, ${modifiers.skin}.
          5. Ensure legs are ${modifiers.legs}.
          6. Footwear MUST match [Image 2] or user description. Do not force specific shoes if not present in reference.
          7. High contrast, cinematic lighting, 8k.
        `;
      } else if (baseImage) {
        mode = "Restyle Base";
        fullPrompt = `
          Task: Image Restyling to Anime Art.
          [Image 1] is the source. Maintain pose and composition strictly.
          Style: ${modifiers.style}.
          Subject: ${prompt || "Beautiful female solo"}, ${modifiers.skin}, ${modifiers.body}.
          Enhancements: ${modifiers.legs}.
          Footwear: Follow user prompt or keep original.
          Make it glossy, vibrant, and high quality.
        `;
      } else if (materialImage) {
        mode = "Material Gen";
        fullPrompt = `
          Task: Character Generation with Material Reference.
          [Image 1] is the CLOTHING/SHOE REFERENCE.
          Generate a character wearing the outfit/items from [Image 1].
          Style: ${modifiers.style}.
          Subject: ${prompt || "Beautiful female solo, dynamic pose"}, ${modifiers.skin}.
          Features: ${modifiers.legs}.
          Footwear: Strictly follow [Image 1].
        `;
      } else {
        mode = "Txt2Img";
        fullPrompt = `${modifiers.style}, beautiful female solo, ${prompt}, ${modifiers.skin}, ${modifiers.body}, ${modifiers.legs}, confident expression, bold pose.`;
      }

      // Add slider adjustments to prompt
      if (settings.skinGloss > 80) fullPrompt += " extreme wet glossy skin, ";

      console.log(`Mode: ${mode}`);
      console.log("Prompt:", fullPrompt);

      let data;

      // Decide API Endpoint
      if (baseImage || materialImage) {
        // Multimodal Generation (Gemini Flash Image Preview)
        const parts = [{ text: fullPrompt }];

        // Add Base Image (Image 1)
        if (baseImage) {
          const base64 = baseImage.split(',')[1];
          const mime = baseImage.split(';')[0].split(':')[1];
          parts.push({ inlineData: { mimeType: mime, data: base64 } });
        }

        // Add Material Image (Image 2)
        if (materialImage) {
          const base64 = materialImage.split(',')[1];
          const mime = materialImage.split(';')[0].split(':')[1];
          parts.push({ inlineData: { mimeType: mime, data: base64 } });
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: parts }],
              generationConfig: { responseModalities: ['IMAGE'] }
            })
          }
        );

        if (!response.ok) throw new Error("API連線失敗");
        data = await response.json();

        const genBase64 = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
        if (genBase64) {
          setGeneratedImage(`data:image/png;base64,${genBase64}`);
        } else {
          throw new Error("無法生成影像，請確認圖片清晰度或簡化指令。");
        }
      } else {
        // Text Only (Imagen)
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instances: [{ prompt: fullPrompt }],
              parameters: { sampleCount: 1, aspectRatio: "3:4", negativePrompt: negativePrompt }
            })
          }
        );

        if (!response.ok) throw new Error("API連線失敗");
        data = await response.json();
        if (data.predictions?.[0]?.bytesBase64Encoded) {
          setGeneratedImage(`data:image/png;base64,${data.predictions[0].bytesBase64Encoded}`);
        } else {
          throw new Error("生成失敗，請稍後再試。");
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "發生未知錯誤");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-pink-500 selection:text-white flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar */}
      <div className="w-full md:w-96 bg-neutral-900 border-r border-neutral-800 flex flex-col h-screen overflow-y-auto z-10 shadow-2xl scrollbar-hide">
        <div className="p-6 border-b border-neutral-800 sticky top-0 bg-neutral-900 z-20">
          <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent flex items-center gap-2">
            <Camera className="text-pink-500" />
            Art Darkroom <span className="text-[10px] text-neutral-500 border border-neutral-700 rounded px-1">PRO</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1">雙圖融合．完全自訂素材．光澤美學</p>
        </div>

        <div className="p-4 space-y-6 pb-32">
          {/* UPLOAD AREA 1: BASE IMAGE */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
              <User size={14} /> 1. 主角原圖 (Base)
            </label>
            {!baseImage ? (
              <div
                onClick={() => baseInputRef.current?.click()}
                className="h-28 border-2 border-dashed border-neutral-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-900/10 transition-all group"
              >
                <User className="text-neutral-600 group-hover:text-blue-400 mb-2" size={20} />
                <span className="text-[10px] text-neutral-500">上傳主角/構圖原圖</span>
              </div>
            ) : (
              <div className="relative h-40 rounded-lg overflow-hidden border border-blue-500/50 group">
                <img src={baseImage} className="w-full h-full object-cover" alt="Base" />
                <button
                  onClick={() => {
                    setBaseImage(null);
                    if (baseInputRef.current) baseInputRef.current.value = '';
                  }}
                  className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full hover:bg-red-500"
                >
                  <X size={12} />
                </button>
                <div className="absolute bottom-0 w-full bg-blue-600/80 text-[10px] text-center text-white py-0.5">構圖與姿勢基準</div>
              </div>
            )}
            <input
              type="file"
              ref={baseInputRef}
              onChange={(e) => handleUpload(e, setBaseImage)}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* UPLOAD AREA 2: MATERIAL IMAGE */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-pink-400 uppercase tracking-wider flex items-center gap-2">
              <Shirt size={14} /> 2. 素材參考 (Reference)
            </label>
            {!materialImage ? (
              <div
                onClick={() => materialInputRef.current?.click()}
                className="h-28 border-2 border-dashed border-neutral-700 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-pink-500 hover:bg-pink-900/10 transition-all group"
              >
                <Shirt className="text-neutral-600 group-hover:text-pink-400 mb-2" size={20} />
                <span className="text-[10px] text-neutral-500">上傳欲替換的服裝/鞋子</span>
              </div>
            ) : (
              <div className="relative h-40 rounded-lg overflow-hidden border border-pink-500/50 group">
                <img src={materialImage} className="w-full h-full object-contain bg-black/50" alt="Material" />
                <button
                  onClick={() => {
                    setMaterialImage(null);
                    if (materialInputRef.current) materialInputRef.current.value = '';
                  }}
                  className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full hover:bg-red-500"
                >
                  <X size={12} />
                </button>
                <div className="absolute bottom-0 w-full bg-pink-600/80 text-[10px] text-center text-white py-0.5">服裝/材質來源</div>
              </div>
            )}
            <input
              type="file"
              ref={materialInputRef}
              onChange={(e) => handleUpload(e, setMaterialImage)}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* Prompt */}
          <div className="space-y-2 pt-2 border-t border-neutral-800">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-neutral-400">文字輔助 (Prompt)</label>
              <button
                onClick={enhancePrompt}
                disabled={isEnhancing}
                className="text-[10px] text-pink-400 hover:text-white flex gap-1 items-center"
              >
                {isEnhancing ? '擴寫中...' : (
                  <>
                    <Wand2 size={10} /> AI 詠唱師
                  </>
                )}
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：銀色長髮，夜晚海灘背景，紅色運動鞋..."
              className="w-full h-20 bg-neutral-800 border-neutral-700 rounded-lg p-2 text-xs focus:border-pink-500 outline-none resize-none text-neutral-200"
            />
          </div>

          {/* Sliders */}
          <div className="bg-neutral-800/50 p-3 rounded-lg space-y-4 border border-neutral-800">
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>皮膚光澤</span>
                <span className="text-pink-400">{settings.skinGloss}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.skinGloss}
                onChange={(e) => setSettings({ ...settings, skinGloss: e.target.value })}
                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>腿部比例</span>
                <span className="text-purple-400">{settings.legLength}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.legLength}
                onChange={(e) => setSettings({ ...settings, legLength: e.target.value })}
                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
            {/* Automated Features Badges - Removed fixed shoe badge */}
            <div className="flex gap-2 mt-2">
              <div className="bg-purple-500/10 border border-purple-500/30 rounded px-2 py-1 text-[10px] text-purple-400 flex items-center justify-center gap-1 w-full">
                <Layers size={10} /> 爆乳身材 (可調整)
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={generateImage}
            disabled={isLoading}
            className={`w-full py-3 rounded-lg font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2
              ${
                isLoading
                  ? 'bg-neutral-800 text-neutral-500'
                  : 'bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:shadow-pink-500/20 text-white'
              }`}
          >
            {isLoading ? (
              <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
            ) : (
              <RefreshCw size={16} />
            )}
            {baseImage && materialImage
              ? '執行雙圖融合 (Dual Fusion)'
              : baseImage
                ? '執行原圖重繪'
                : materialImage
                  ? '執行素材生成'
                  : '開始生成'}
          </button>
        </div>
      </div>

      {/* Main Canvas */}
      <div className="flex-1 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] bg-neutral-950 flex items-center justify-center p-8 relative">
        {/* Status Bar */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-center pointer-events-none">
          <div className="bg-black/50 backdrop-blur px-3 py-1 rounded-full border border-white/10 text-[10px] text-neutral-400 font-mono">
            INPUTS: {baseImage ? 'BASE ' : ''}
            {materialImage ? '+ MATERIAL' : ''}
            {!baseImage && !materialImage ? 'TEXT ONLY' : ''}
          </div>
          {generatedImage && (
            <div className="flex gap-2 pointer-events-auto">
              <button
                onClick={() => analyzeImage(null)}
                disabled={isAnalyzing}
                className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded-lg border border-neutral-600 shadow-lg"
              >
                {isAnalyzing ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                ) : (
                  <Sparkles size={16} />
                )}
              </button>
              <button
                onClick={() => {
                  const l = document.createElement('a');
                  l.href = generatedImage;
                  l.download = 'art_darkroom.png';
                  l.click();
                }}
                className="bg-pink-600 hover:bg-pink-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-xs font-bold"
              >
                <Download size={14} /> 下載
              </button>
            </div>
          )}
        </div>

        {/* Error / Image Display */}
        {error ? (
          <div className="bg-red-900/20 border border-red-500/30 text-red-200 p-4 rounded-lg max-w-md text-center text-sm backdrop-blur">
            <p className="font-bold mb-1">錯誤</p>
            {error}
          </div>
        ) : generatedImage ? (
          <div className="relative group max-h-full max-w-full">
            {analysisResult && (
              <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur border border-pink-500/30 p-3 rounded-lg text-xs text-neutral-200 shadow-2xl animate-in slide-in-from-bottom-2 fade-in">
                <div className="flex justify-between items-start gap-2">
                  <p className="leading-relaxed">
                    <span className="text-pink-400 font-bold">鑑賞報告：</span>
                    {analysisResult}
                  </p>
                  <button onClick={() => setAnalysisResult(null)}>
                    <X size={12} className="text-neutral-500 hover:text-white" />
                  </button>
                </div>
              </div>
            )}
            <img
              src={generatedImage}
              alt="Generated"
              className="max-h-[85vh] object-contain rounded-lg shadow-2xl shadow-pink-900/10 border border-neutral-800"
            />
          </div>
        ) : (
          <div className="text-neutral-700 flex flex-col items-center gap-4 animate-pulse">
              <div className="flex gap-4 opacity-30">
                <div className="w-16 h-20 border-2 border-dashed border-neutral-500 rounded flex items-center justify-center">
                  <User />
                </div>
                <div className="text-2xl pt-6">+</div>
                <div className="w-16 h-20 border-2 border-dashed border-neutral-500 rounded flex items-center justify-center">
                  <Shirt />
                </div>
              </div>
            <p className="text-sm font-medium tracking-widest uppercase">Waiting for Input</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArtDarkroom;
