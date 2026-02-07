package com.voicenav.controller;

import com.voicenav.model.*;
import com.voicenav.service.GeminiService;
import com.voicenav.service.MapsService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Slf4j
public class NavigationController {

    private final GeminiService geminiService;
    private final MapsService mapsService;

    /**
     * Process voice input and return navigation route
     */
    @PostMapping("/process-voice")
    public ResponseEntity<NavigationResponse> processVoice(
            @RequestParam("audio") MultipartFile audioFile) {

        log.info("=== /api/process-voice called ===");

        try {
            if (audioFile.isEmpty()) {
                log.warn("No audio file provided");
                return ResponseEntity.badRequest().body(
                        NavigationResponse.builder()
                                .success(false)
                                .error("No audio file provided")
                                .build());
            }

            log.info("Received audio file: mimetype={}, size={}, name={}",
                    audioFile.getContentType(),
                    audioFile.getSize(),
                    audioFile.getOriginalFilename());

            log.info("Processing with Gemini...");

            // Step 1: Extract stops from audio using Gemini
            GeminiExtractionResult geminiResult = geminiService.extractStopsFromAudio(
                    audioFile.getBytes(),
                    audioFile.getContentType());

            if (geminiResult.getError() != null ||
                    geminiResult.getStops() == null ||
                    geminiResult.getStops().isEmpty()) {

                String error = geminiResult.getError() != null ?
                        geminiResult.getError() : "No locations found in audio";

                log.warn("Gemini extraction failed: {}", error);
                return ResponseEntity.badRequest().body(
                        NavigationResponse.builder()
                                .success(false)
                                .error(error)
                                .build());
            }

            // Save audio to voice_buffer/ named by waypoints
            try {
                Path voiceBufferDir = Paths.get("../voice_buffer");
                Files.createDirectories(voiceBufferDir);
                String waypoints = geminiResult.getStops().stream()
                        .map(s -> s.getOriginal().replaceAll("[/\\\\:*?\"<>|]", "_"))
                        .collect(Collectors.joining(", "));
                String bufferFilename = "[" + waypoints + "].mp3";
                Path bufferPath = voiceBufferDir.resolve(bufferFilename);
                Files.write(bufferPath, audioFile.getBytes());
                log.info("Saved voice buffer: {}", bufferPath);
            } catch (IOException e) {
                log.error("Failed to save voice buffer", e);
            }

            // Log extracted stops
            log.info("Extracted stops:");
            for (int i = 0; i < geminiResult.getStops().size(); i++) {
                StopInfo stop = geminiResult.getStops().get(i);
                log.info("  {}. [{}] \"{}\" (confidence: {})",
                        i + 1, stop.getType(), stop.getOriginal(), stop.getConfidence());
            }

            // Step 2: Get route from Google Maps
            log.info("Getting route from Google Maps...");
            RouteResponse routeData = mapsService.getMultiStopRoute(geminiResult.getStops());

            // Return combined result
            List<String> allWarnings = new ArrayList<>();
            if (routeData.getWarnings() != null) {
                allWarnings.addAll(routeData.getWarnings());
            }

            return ResponseEntity.ok(NavigationResponse.builder()
                    .success(true)
                    .transcript(geminiResult.getTranscript())
                    .extractedStops(geminiResult.getStops())
                    .route(routeData)
                    .warnings(allWarnings)
                    .build());

        } catch (Exception e) {
            log.error("Error processing voice", e);
            return ResponseEntity.internalServerError().body(
                    NavigationResponse.builder()
                            .success(false)
                            .error(e.getMessage() != null ? e.getMessage() : "Failed to process voice input")
                            .build());
        }
    }

    /**
     * Get route for manually specified stops
     */
    @PostMapping("/route")
    public ResponseEntity<NavigationResponse> getRoute(@RequestBody Map<String, List<String>> request) {
        try {
            List<String> stops = request.get("stops");

            if (stops == null || stops.size() < 2) {
                return ResponseEntity.badRequest().body(
                        NavigationResponse.builder()
                                .success(false)
                                .error("At least 2 stops are required")
                                .build());
            }

            // Convert simple strings to StopInfo objects
            List<StopInfo> stopInfos = stops.stream()
                    .map(s -> StopInfo.builder()
                            .original(s)
                            .type("partial")
                            .searchQuery(s)
                            .confidence(1.0)
                            .build())
                    .toList();

            RouteResponse routeData = mapsService.getMultiStopRoute(stopInfos);

            return ResponseEntity.ok(NavigationResponse.builder()
                    .success(true)
                    .route(routeData)
                    .build());

        } catch (Exception e) {
            log.error("Error getting route", e);
            return ResponseEntity.internalServerError().body(
                    NavigationResponse.builder()
                            .success(false)
                            .error(e.getMessage() != null ? e.getMessage() : "Failed to get route")
                            .build());
        }
    }

    /**
     * List all saved voice buffer files
     */
    @GetMapping("/voice-buffers")
    public ResponseEntity<Map<String, Object>> listVoiceBuffers() {
        try {
            Path voiceBufferDir = Paths.get("../voice_buffer");
            if (!Files.exists(voiceBufferDir)) {
                return ResponseEntity.ok(Map.of("success", true, "buffers", List.of()));
            }

            List<Map<String, Object>> buffers;
            try (Stream<Path> paths = Files.list(voiceBufferDir)) {
                buffers = paths
                        .filter(Files::isRegularFile)
                        .map(p -> {
                            try {
                                return Map.<String, Object>of(
                                        "filename", p.getFileName().toString(),
                                        "size", Files.size(p)
                                );
                            } catch (IOException e) {
                                return Map.<String, Object>of(
                                        "filename", p.getFileName().toString(),
                                        "size", 0
                                );
                            }
                        })
                        .toList();
            }

            return ResponseEntity.ok(Map.of("success", true, "buffers", buffers));
        } catch (IOException e) {
            log.error("Error listing voice buffers", e);
            return ResponseEntity.internalServerError().body(
                    Map.of("success", false, "error", "Failed to list voice buffers"));
        }
    }

    /**
     * Serve a specific voice buffer audio file
     */
    @GetMapping("/voice-buffers/{filename}")
    public ResponseEntity<byte[]> getVoiceBuffer(@PathVariable String filename) {
        try {
            Path filePath = Paths.get("../voice_buffer").resolve(filename).normalize();
            if (!filePath.getParent().equals(Paths.get("../voice_buffer").normalize())) {
                return ResponseEntity.badRequest().build();
            }

            if (!Files.exists(filePath)) {
                return ResponseEntity.notFound().build();
            }

            byte[] audioBytes = Files.readAllBytes(filePath);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_TYPE, "audio/mpeg")
                    .body(audioBytes);
        } catch (IOException e) {
            log.error("Error serving voice buffer", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Health check / test endpoint
     */
    @GetMapping("/test")
    public ResponseEntity<Map<String, String>> test() {
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "message", "API is working"
        ));
    }

    /**
     * Health check endpoint
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok"));
    }
}
