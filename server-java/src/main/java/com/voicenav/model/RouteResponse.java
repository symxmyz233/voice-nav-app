package com.voicenav.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RouteResponse {
    private List<GeocodedStop> stops;
    private List<RouteLeg> legs;
    private String overview_polyline;
    private Map<String, Object> bounds;
    private RouteTotals totals;
    private List<String> warnings;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RouteTotals {
        private RouteLeg.DistanceInfo distance;
        private RouteLeg.DistanceInfo duration;
    }
}
