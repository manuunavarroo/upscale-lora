// File: app/api/history/route.ts

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
export const revalidate = 0;

// Updated type to reflect new data structure in Redis
type HistoryTask = {
  taskId: string;
  originalFilename: string; // Changed from prompt
  status: 'processing' | 'complete';
  createdAt: string;
  imageUrl?: string; // Stays the same, added by webhook
  completedAt?: string; // Stays the same, added by webhook
};

export async function GET() {
  try {
    const keys = await redis.keys('*');
    if (keys.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch all items from Redis
    const items = await redis.mget<HistoryTask[]>(...keys);

    // Filter out any potential null values
    const validItems = items.filter((item): item is HistoryTask => item !== null);

    // Sort items by creation date, newest first
    const sortedItems = validItems.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json(sortedItems);
  } catch (error: unknown) {  
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    console.error("--- HISTORY API ERROR ---", errorMessage);
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
