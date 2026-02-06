package com.voicenav.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RouteLeg {
    private String startAddress;
    private String endAddress;
    private DistanceInfo distance;
    private DistanceInfo duration;
    private List<RouteStep> steps;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RouteStep {
        private String instruction;
        private DistanceInfo distance;
        private DistanceInfo duration;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DistanceInfo {
        private Long value;
        private String text;
    }
}
