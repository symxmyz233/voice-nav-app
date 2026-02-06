import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log('API Key:', apiKey);
console.log('Key length:', apiKey?.length || 0);

const ai = new GoogleGenAI({ apiKey });

async function sayHi() {
  try {
    const response = await ai.models.generateContent({
      // model: 'gemini-2.0-flash',
      model: 'gemini-3-flash-preview',
      contents: 'Hi! Please respond with a short greeting.',
    });
    console.log('Gemini says:', response.text);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

sayHi();
