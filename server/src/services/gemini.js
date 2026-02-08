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
 * @param {Object} currentRoute - Optional current route context for modification commands
 * @returns {Promise<{stops: Array, commandType: string, insertPosition: Object}>} - Extracted stops with structured data
 */
export async function extractStopsFromAudio(audioBuffer, mimeType, currentRoute = null) {
  // Build context information if there's an existing route
  let contextInfo = '';
  if (currentRoute && currentRoute.stops && currentRoute.stops.length > 0) {
    const stopsList = currentRoute.stops.map((stop, idx) =>
      `${idx}: ${stop.name || stop.address || 'Unknown'}`
    ).join(', ');
    contextInfo = `\n\nCurrent route context:\nExisting stops: ${stopsList}\n`;
  }

  const prompt = `Analyze this audio recording of a navigation request.
Extract all locations/stops mentioned and classify each one.${contextInfo}

Return ONLY a valid JSON object in this exact format, with no additional text:
{
  "transcript": "the full transcription of what the user said",
  "commandType": "new_route|add_stop|insert_stop|replace_stop",
  "stops": [
    {
      "original": "exactly what the user said for this stop",
      "type": "full_address|landmark|partial|relative",
      "parsed": {
        "streetNumber": "<number> or null",
        "streetName": "<street> or null",
        "city": "<city> or null",
        "state": "<state> or null",
        "country": "<country> or null",
        "postalCode": "<zip> or null",
        "landmark": "<landmark name> or null",
        "businessName": "<business name> or null"
      },
      "searchQuery": "optimized string for Google Maps geocoding",
      "confidence": 0.0 to 1.0
    }
  ],

IMPORTANT EXAMPLES:
✅ CORRECT:
User says "Starbucks" → type="landmark", businessName="Starbucks", searchQuery="Starbucks"
User says "99 Ranch" → type="landmark", businessName="99 Ranch", searchQuery="99 Ranch"
User says "Target in Edison" → type="landmark", businessName="Target", city="Edison", searchQuery="Target Edison NJ"

❌ WRONG:
User says "Starbucks" → type="partial" ❌ (should be landmark)
User says "Target" → streetName="Target" ❌ (should be businessName="Target")
User says "downtown Edison" → type="landmark", landmark="downtown" ❌ (should be type="partial" or use city)
  "insertPosition": {
    "type": "after|before|between|append|replace",
    "referenceIndex": <index of reference stop in current route, or null>,
    "referenceIndex2": <second index if type is "between", or null>
  }
}

Command Type Guidelines:
- "new_route": User is specifying a completely new route from scratch (e.g., "Navigate from A to B", "Go from X to Y")
  * ONLY use this if the user explicitly says "navigate", "go from", "route from", etc. with BOTH start and end locations
- "add_stop": User wants to add a stop to existing route WITHOUT specifying position (e.g., "Add a stop at C", "Stop at C", "I want to go to C")
  * ⚠️ CRITICAL: Extract ONLY ONE stop - the location being added. DO NOT extract existing route locations.
- "insert_stop": User wants to insert a stop at a SPECIFIC position (e.g., "Add C between A and B", "Insert C after A", "Put C before B")
  * IMPORTANT: If user mentions "between", "after", "before", this is ALWAYS "insert_stop", NOT "new_route"
  * ⚠️ CRITICAL: Extract ONLY ONE stop - the location being inserted. DO NOT extract existing route locations.
- "replace_stop": User wants to replace an existing stop (e.g., "Change B to C", "Replace A with D")
  * ⚠️ CRITICAL: Extract ONLY ONE stop - the new replacement location. DO NOT extract the old location being replaced.

CRITICAL: If there is existing route context provided above, and the user mentions adding/inserting a location, it should be "add_stop" or "insert_stop", NOT "new_route"!

Insert Position Guidelines:
- If user says "add a stop at X" or "I want to stop at X" without position → type="append", referenceIndex=null
- If user says "add X after Y" → type="after", referenceIndex=<index of Y>
- If user says "add X before Y" → type="before", referenceIndex=<index of Y>
- If user says "add X between Y and Z" → type="between", referenceIndex=<index of Y>, referenceIndex2=<index of Z>
- If user says "change/replace Y to X" → type="replace", referenceIndex=<index of Y>

Location Guidelines:
- The first location should be the starting point and the last should be the final destination (for new_route)
- ⚠️ IMPORTANT: For businesses, stores, restaurants, or any named places (e.g., "Starbucks", "Walmart", "99 Ranch", "Target"), ALWAYS set type="landmark" and populate businessName field
  * Examples: "Starbucks in Edison" → type="landmark", businessName="Starbucks", city="Edison"
  * "99 Ranch downtown" → type="landmark", businessName="99 Ranch"
  * Even small/local stores should be classified as landmarks if they have a business name
- For famous landmarks like "Time Square", "Golden Gate Bridge", set type="landmark" and populate the landmark field
- For full addresses with street number and name, parse into components and set type="full_address"
- For partial addresses (missing city or state), set type="partial"
- For relative locations like "nearest gas station" or "my house", set type="relative"
- ⚠️ CRITICAL RULE: If streetNumber AND streetName are both null/empty, you MUST use businessName or landmark as the primary identifier
  * In this case, set type="landmark" and populate businessName field
  * Do NOT use partial address type when there's a clear business name
  * Example: User says "Target" → type="landmark", businessName="Target" (NOT type="partial")
- "searchQuery" should be the best optimized string to send to Google Maps API:
  * For businesses/landmarks: Use business name first, then add location context (e.g., "Starbucks Edison NJ" not "Edison Starbucks")
  * For addresses: Use full address components in proper order
  * If streetNumber AND streetName are null, prioritize businessName in searchQuery
- If unsure about a component, leave it null
- Confidence scale: 1.0 = certain, 0.7 = fairly confident, 0.5 = ambiguous, 0.3 = guessing

If you cannot understand the audio or no locations are mentioned, return:
{"stops": [], "commandType": "error", "error": "Could not extract locations from audio"}`;

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

      // Set defaults if not provided
      if (!result.commandType) {
        result.commandType = 'new_route';
      }
      if (!result.insertPosition) {
        result.insertPosition = { type: 'append', referenceIndex: null, referenceIndex2: null };
      }

      return result;
    }

    throw new Error('Could not parse Gemini response as JSON');
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}
