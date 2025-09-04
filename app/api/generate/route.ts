// File: app/api/generate/route.ts

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { put } from '@vercel/blob';

const redis = Redis.fromEnv();

// Updated credentials from .env.local
const RUN_URL = process.env.RUNNINGHUB_RUN_URL!;
const API_KEY = process.env.RUNNINGHUB_API_KEY!;
const WEBAPP_ID = process.env.RUNNINGHUB_WEBAPP_ID!;

const getScaleValue = (scale: string): string => {
  switch (scale) {
    case 'x2': return "0.25";
    case 'x4': return "0.5";
    case 'x8': return "1.0";
    default: return "0.5"; // Default to x4
  }
};

const getLoraStrength = (useLora: string, loraType: string): string => {
  if (useLora !== 'true') {
    return "0";
  }
  switch (loraType) {
    case 'close-up': return "2.0";
    case 'half-body': return "1.5";
    case 'full-body': return "1.0";
    default: return "0";
  }
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const scale = formData.get('scale') as string;
    const useLora = formData.get('useLora') as string; // Will be "true" or "false"
    const loraType = formData.get('loraType') as string;
    const seed = formData.get('seed') as string;

    if (!imageFile) {
      return NextResponse.json({ message: 'Image file is required.' }, { status: 400 });
    }

    // 1. Upload the image to Vercel Blob storage
    const blob = await put(imageFile.name, imageFile, {
      access: 'public',
    });
    
    // The 'pathname' is the unique filename on the blob storage
    const uploadedImageFilename = blob.pathname;

    // 2. Prepare the nodeInfoList for the RunningHub API
    const nodeInfoList = [
      // Image Node
      { nodeId: '15', fieldName: 'image', fieldValue: uploadedImageFilename },
      // Scale Node
      { nodeId: '25', fieldName: 'default_value', fieldValue: getScaleValue(scale) },
      // LoRA Strength Node
      { nodeId: '22', fieldName: 'strength_model', fieldValue: getLoraStrength(useLora, loraType) },
    ];
    
    const finalSeed = (seed === 'random' || !seed) 
      ? Math.floor(Math.random() * 100000000000000).toString() // Use a large random number
      : seed;
    // Seed Node
    nodeInfoList.push({ nodeId: '7', fieldName: 'seed', fieldValue: finalSeed });

    // 3. Call the RunningHub API
    const payload = {
      webappId: WEBAPP_ID,
      apiKey: API_KEY,
      nodeInfoList: nodeInfoList,
    };

    const response = await fetch(RUN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Host': 'www.runninghub.ai' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (result.code !== 0) {
      throw new Error(`API Error: ${result.msg || 'Unknown error from RunningHub'}`);
    }

    const taskId = result.data.taskId;
    
    // 4. Store task details in Redis
    const taskData = { 
      taskId, 
      originalFilename: imageFile.name, 
      status: 'processing', 
      createdAt: new Date().toISOString() // Use ISO string for consistency
    };
    await redis.set(taskId, JSON.stringify(taskData));

    return NextResponse.json({ success: true, taskId });

  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) { errorMessage = error.message; }
    console.error("--- GENERATE API ERROR ---", errorMessage);
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
