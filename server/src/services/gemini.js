import { GoogleGenAI } from '@google/genai';

let ai = null;

function getClient() {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

/**
 * Process audio input and extract navigation stops using Gemini
 * @param {Buffer} audioBuffer - The audio file buffer
 * @param {string} mimeType - The MIME type of the audio file
 * @returns {Promise<{stops: Array}>} - Extracted stops with structured data
 */
export async function extractStopsFromAudio(audioBuffer, mimeType) {
  const prompt = `Analyze this audio recording of a navigation request.
Extract all locations/stops mentioned and classify each one.

Return ONLY a valid JSON object in this exact format, with no additional text:
{
  "stops": [
    {
      "original": "exactly what user said",
      "type": "full_address|landmark|partial|relative",
      "parsed": {
        "streetNumber": "40" or null,
        "streetName": "Wickley Ave" or null,
        "city": "Piscataway" or null,
        "state": "New Jersey" or null,
        "country": "USA" or null,
        "postalCode": null,
        "landmark": "Time Square" or null,
        "businessName": null
      },
      "searchQuery": "optimized string for Google Maps geocoding",
      "confidence": 0.95
    }
  ]
}

Guidelines:
- The first location should be the starting point and the last should be the final destination
- For landmarks like "Time Square", "Golden Gate Bridge", set type="landmark" and populate the landmark field
- For full addresses with street number and name, parse into components and set type="full_address"
- For partial addresses (missing city or state), set type="partial"
- For relative locations like "nearest gas station" or "my house", set type="relative"
- "searchQuery" should be the best optimized string to send to Google Maps API for geocoding
- If unsure about a component, leave it null
- Confidence scale: 1.0 = certain, 0.7 = fairly confident, 0.5 = ambiguous, 0.3 = guessing

If you cannot understand the audio or no locations are mentioned, return:
{"stops": [], "error": "Could not extract locations from audio"}`;

  try {
    const response = await getClient().models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: audioBuffer.toString('base64'),
                mimeType: mimeType
              }
            }
          ]
        }
      ]
    });

    const text = response.text;
    console.log('Gemini raw response:', text);

    // Parse the JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log('Parsed Gemini result:', JSON.stringify(result, null, 2));
      return result;
    }

    throw new Error('Could not parse Gemini response as JSON');
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}
