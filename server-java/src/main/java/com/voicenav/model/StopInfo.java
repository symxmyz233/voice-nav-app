package com.voicenav.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StopInfo {
    private String original;
    private String type; // full_address, landmark, partial, relative
    private ParsedAddress parsed;
    private String searchQuery;
    private Double confidence;
}
