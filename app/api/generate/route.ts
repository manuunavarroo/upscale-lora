// File: app/api/generate/route.ts

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// API Endpoints and Credentials
const UPLOAD_URL = "https://www.runninghub.ai/task/openapi/upload";
const RUN_URL = process.env.RUNNINGHUB_RUN_URL!;
const API_KEY = process.env.RUNNINGHUB_API_KEY!;
const WEBAPP_ID = process.env.RUNNINGHUB_WEBAPP_ID!;

// Helper function for scale value
const getScaleValue = (scale: string): string => {
  switch (scale) {
    case 'x2': return "0.5";
    case 'x4': return "1";
    case 'x8': return "2";
    default: return "1";
  }
};

// REMOVED: getLoraStrength function is no longer needed.

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const scale = formData.get('scale') as string;
    const useLora = formData.get('useLora') as string;
    // UPDATED: Receive loraStrength from the form data
    const loraStrength = formData.get('loraStrength') as string;
    const seed = formData.get('seed') as string;

    if (!imageFile) {
      return NextResponse.json({ message: 'Image file is required.' }, { status: 400 });
    }

    // STEP 1: Upload the image to RunningHub
    const uploadFormData = new FormData();
    uploadFormData.append('apiKey', API_KEY);
    uploadFormData.append('file', imageFile);
    uploadFormData.append('fileType', 'image');

    const uploadResponse = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'Host': 'www.runninghub.ai' },
      body: uploadFormData,
    });

    const uploadResult = await uploadResponse.json();

    if (uploadResult.code !== 0) {
      throw new Error(`RunningHub Upload Error: ${uploadResult.msg}`);
    }

    const uploadedImageFilename = uploadResult.data.fileName;

    // STEP 2: Use the returned filename to run the workflow
    const nodeInfoList = [
      { nodeId: '15', fieldName: 'image', fieldValue: uploadedImageFilename },
      { nodeId: '25', fieldName: 'default_value', fieldValue: getScaleValue(scale) },
      // UPDATED: Use the loraStrength value directly if useLora is true
      { nodeId: '22', fieldName: 'strength_model', fieldValue: useLora === 'true' ? loraStrength : "0" },
    ];
    
    const finalSeed = (seed === 'random' || !seed) 
      ? Math.floor(Math.random() * 100000000000000).toString()
      : seed;
    nodeInfoList.push({ nodeId: '7', fieldName: 'seed', fieldValue: finalSeed });

    const payload = {
      webappId: WEBAPP_ID,
      apiKey: API_KEY,
      nodeInfoList: nodeInfoList,
    };

    const runResponse = await fetch(RUN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Host': 'www.runninghub.ai' },
      body: JSON.stringify(payload),
    });

    const runResult = await runResponse.json();
    if (runResult.code !== 0) {
      const errorMessage = runResult.error?.details || runResult.msg || 'Unknown error from RunningHub';
      throw new Error(`API Error: ${errorMessage}`);
    }

    const taskId = runResult.data.taskId;
    
    const taskData = { 
      taskId, 
      originalFilename: imageFile.name, 
      status: 'processing', 
      createdAt: new Date().toISOString()
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
