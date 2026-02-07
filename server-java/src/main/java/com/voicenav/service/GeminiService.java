package com.voicenav.service;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.voicenav.model.GeminiExtractionResult;
import com.voicenav.model.ParsedAddress;
import com.voicenav.model.StopInfo;
import lombok.extern.slf4j.Slf4j;
import okhttp3.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
public class GeminiService {

    @Value("${gemini.api.key}")
    private String geminiApiKey;

    private final OkHttpClient httpClient = new OkHttpClient();
    private final Gson gson = new Gson();

    private static final String GEMINI_API_URL =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    private static final String EXTRACTION_PROMPT = """
        Analyze this audio recording of a navigation request.
        Extract all locations/stops mentioned and classify each one.

        Return ONLY a valid JSON object in this exact format, with no additional text:
        {
          "transcript": "the full transcription of what the user said",
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
        {"stops": [], "error": "Could not extract locations from audio"}
        """;

    public GeminiExtractionResult extractStopsFromAudio(byte[] audioData, String mimeType) throws IOException {
        log.info("Extracting stops from audio, size: {} bytes, mimeType: {}", audioData.length, mimeType);

        String base64Audio = Base64.getEncoder().encodeToString(audioData);

        // Build request body
        JsonObject requestBody = new JsonObject();
        JsonObject content = new JsonObject();
        content.add("parts", JsonParser.parseString(String.format("""
            [
                {"text": %s},
                {"inline_data": {"mime_type": "%s", "data": "%s"}}
            ]
            """, gson.toJson(EXTRACTION_PROMPT), mimeType, base64Audio)));

        JsonObject contentsWrapper = new JsonObject();
        contentsWrapper.add("contents", JsonParser.parseString("[" + content.toString() + "]"));

        Request request = new Request.Builder()
                .url(GEMINI_API_URL + "?key=" + geminiApiKey)
                .post(RequestBody.create(
                        contentsWrapper.toString(),
                        MediaType.parse("application/json")))
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                String errorBody = response.body() != null ? response.body().string() : "No error body";
                log.error("Gemini API error: {} - {}", response.code(), errorBody);
                throw new IOException("Gemini API error: " + response.code() + " - " + errorBody);
            }

            String responseBody = response.body().string();
            log.debug("Gemini raw response: {}", responseBody);

            return parseGeminiResponse(responseBody);
        }
    }

    private GeminiExtractionResult parseGeminiResponse(String responseBody) {
        try {
            JsonObject jsonResponse = JsonParser.parseString(responseBody).getAsJsonObject();

            // Extract text from response
            String text = jsonResponse
                    .getAsJsonArray("candidates")
                    .get(0).getAsJsonObject()
                    .getAsJsonObject("content")
                    .getAsJsonArray("parts")
                    .get(0).getAsJsonObject()
                    .get("text").getAsString();

            log.info("Gemini extracted text: {}", text);

            // Extract JSON from the response text
            Pattern pattern = Pattern.compile("\\{[\\s\\S]*\\}");
            Matcher matcher = pattern.matcher(text);

            if (matcher.find()) {
                String jsonStr = matcher.group();
                return gson.fromJson(jsonStr, GeminiExtractionResult.class);
            }

            return GeminiExtractionResult.builder()
                    .stops(new ArrayList<>())
                    .error("Could not parse Gemini response as JSON")
                    .build();

        } catch (Exception e) {
            log.error("Error parsing Gemini response", e);
            return GeminiExtractionResult.builder()
                    .stops(new ArrayList<>())
                    .error("Failed to parse Gemini response: " + e.getMessage())
                    .build();
        }
    }
}
