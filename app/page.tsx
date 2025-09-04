// File: app/page.tsx

'use client';
import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import Image from 'next/image';

interface HistoryItem {
  taskId: string;
  originalFilename: string; // Changed from 'prompt'
  status: 'processing' | 'complete';
  imageUrl?: string;
  createdAt: string;
}

export default function Home() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scale, setScale] = useState<string>('x4'); // New state for scaling
  const [useLora, setUseLora] = useState<boolean>(false);
  const [loraType, setLoraType] = useState<string>('close-up'); // New state for LoRA type
  const [seedMode, setSeedMode] = useState<'random' | 'fixed'>('random');
  const [seedValue, setSeedValue] = useState<string>('');
  
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // fetchHistory logic remains the same as your original code
  const fetchHistory = async () => {
    try {
      let historyResponse = await fetch('/api/history');
      if (!historyResponse.ok) return;
      
      let data: HistoryItem[] = await historyResponse.json();
      setHistory(data);

      const processingTasks = data.filter(item => item.status === 'processing');

      if (processingTasks.length > 0) {
        // No need to trigger checks from the client, webhook handles it
        // but this can serve as a fallback.
        for (const task of processingTasks) {
          await fetch('/api/check-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: task.taskId }),
          });
        }
        
        historyResponse = await fetch('/api/history');
        if (historyResponse.ok) {
          data = await historyResponse.json();
          setHistory(data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  useEffect(() => {
    const interval = setInterval(fetchHistory, 5000);
    fetchHistory();
    return () => clearInterval(interval);
  }, []);
  
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!imageFile) {
      setMessage('❌ Please upload an image first.');
      return;
    }
    if (seedMode === 'fixed' && !seedValue) {
      setMessage('❌ Please enter a seed value for Fixed mode.');
      return;
    }

    setLoading(true);
    setMessage('Uploading image and sending request...');

    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('scale', scale);
    formData.append('useLora', String(useLora));
    formData.append('loraType', loraType);
    const finalSeed = seedMode === 'random' ? 'random' : seedValue;
    formData.append('seed', finalSeed);

    try {
      // The browser will set the correct 'multipart/form-data' header
      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'An error occurred');
      
      setMessage(`✅ Request sent! Your upscaled image will appear below.`);
      setTimeout(fetchHistory, 1000); // Fetch history soon after submission
    } catch (error: unknown) {
      let errorMessage = 'An error occurred';
      if (error instanceof Error) { errorMessage = error.message; }
      setMessage(`❌ Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const processingCount = history.filter(item => item.status === 'processing').length;
  const isQueueFull = processingCount >= 3;

  return (
    <main className="bg-slate-50 min-h-screen p-4 sm:p-8">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-lg shadow-md h-fit">
          <h1 className="text-2xl font-bold mb-4 text-black">AI Image Upscaler</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div>
              <label htmlFor="image-upload" className="block text-sm font-medium text-gray-700 mb-1">Upload Image</label>
              <input id="image-upload" type="file" accept="image/png, image/jpeg" onChange={handleImageChange} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" required/>
              {imagePreview && (
                <div className="mt-4">
                  <Image src={imagePreview} alt="Image preview" width={200} height={200} className="rounded-md w-auto h-auto max-h-48" />
                </div>
              )}
            </div>

            <div>
              <label htmlFor="scale" className="block text-sm font-medium text-gray-700 mb-1">Scale By</label>
              <select id="scale" value={scale} onChange={(e) => setScale(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md text-black">
                <option value="x2">x2</option>
                <option value="x4">x4</option>
                <option value="x8">x8</option>
              </select>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-medium text-gray-800 mb-2">Advanced Options</h3>
              <div className="flex items-center justify-between">
                <label htmlFor="lora" className="text-sm font-medium text-gray-700">Add Skin Lora?</label>
                <button type="button" onClick={() => setUseLora(!useLora)} className={`${useLora ? 'bg-blue-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 items-center rounded-full`}>
                  <span className={`${useLora ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition`}/>
                </button>
              </div>

              {useLora && (
                <div className="mt-4 pl-2 border-l-2 border-blue-500">
                    <label className="block text-sm font-medium text-gray-700 mb-2">LoRA Type</label>
                    <div className="space-y-2">
                        <label className="flex items-center">
                            <input type="radio" name="loraType" value="close-up" checked={loraType === 'close-up'} onChange={(e) => setLoraType(e.target.value)} className="h-4 w-4 border-gray-300 text-blue-600"/>
                            <span className="ml-2 text-sm text-gray-700">Close-up Portrait</span>
                        </label>
                        <label className="flex items-center">
                            <input type="radio" name="loraType" value="half-body" checked={loraType === 'half-body'} onChange={(e) => setLoraType(e.target.value)} className="h-4 w-4 border-gray-300 text-blue-600"/>
                            <span className="ml-2 text-sm text-gray-700">Half Body</span>
                        </label>
                        <label className="flex items-center">
                            <input type="radio" name="loraType" value="full-body" checked={loraType === 'full-body'} onChange={(e) => setLoraType(e.target.value)} className="h-4 w-4 border-gray-300 text-blue-600"/>
                            <span className="ml-2 text-sm text-gray-700">Full Body</span>
                        </label>
                    </div>
                </div>
              )}

              <div className="mt-4">
                 <label className="block text-sm font-medium text-gray-700 mb-2">Seed</label>
                 <div className="flex items-center space-x-4">
                   <label className="flex items-center">
                     <input type="radio" name="seedMode" value="random" checked={seedMode === 'random'} onChange={() => setSeedMode('random')} className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"/>
                     <span className="ml-2 text-sm text-gray-700">Randomized</span>
                   </label>
                   <label className="flex items-center">
                     <input type="radio" name="seedMode" value="fixed" checked={seedMode === 'fixed'} onChange={() => setSeedMode('fixed')} className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"/>
                     <span className="ml-2 text-sm text-gray-700">Fixed</span>
                   </label>
                 </div>
                 {seedMode === 'fixed' && (
                   <input type="number" placeholder="Enter a seed number" value={seedValue} onChange={(e) => setSeedValue(e.target.value)} className="mt-2 w-full p-2 border border-gray-300 rounded-md text-black" required/>
                 )}
               </div>
            </div>
            
            <button type="submit" disabled={loading || isQueueFull} className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
              {loading ? 'Processing...' : 'Upscale Image'}
            </button>
          </form>
          
          {isQueueFull && (
            <div className="mt-4 p-3 rounded-md text-sm bg-amber-100 text-amber-800 text-center">
              Queue is full (3 images processing). Please wait.
            </div>
          )}

          {message && <div className={`mt-4 p-3 rounded-md text-sm ${message.startsWith('❌') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{message}</div>}
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-bold mb-4 text-black">History</h2>
          <div className="space-y-4 max-h-[80vh] overflow-y-auto">
            {history.length > 0 ? history.map((item) => (
              <div key={item.taskId} className="border p-3 rounded-md bg-gray-50">
                <p className="font-semibold text-gray-800 break-words">{item.originalFilename}</p>
                <p className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()}</p>
                <div className="mt-2">
                  {item.status === 'complete' && item.imageUrl ? (
                    <Image 
                      src={item.imageUrl} 
                      alt={item.originalFilename} 
                      width={1080} // Default display width
                      height={1080} // Default display height
                      className="rounded-md w-full h-auto" 
                    />
                  ) : (
                    <div className="text-center p-4 bg-gray-200 rounded-md"><p className="text-sm text-gray-600">⌛ Processing...</p></div>
                  )}
                </div>
              </div>
            )) : <p className="text-gray-500">Your upscaled images will appear here.</p>}
          </div>
        </div>
      </div>
    </main>
  );
}
