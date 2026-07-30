#pragma once
#include <nlohmann/json.hpp>
#include <vector>
#include <string>
#include <map>
#include "NexusType.h"

struct FilterRequest {
    std::string node_type;
    std::vector<sa::RobotPointEx> points;
    std::map<std::string, double> params;
};

struct FilterResponse {
    std::vector<sa::RobotPointEx> result;
};

// Parse {node_type, input:{points}, params} -> FilterRequest.
// Points carry x,y,z,rx,ry,rz (pose passed through untouched by filters).
bool parseFilterRequest(const nlohmann::json& j, FilterRequest& out);

// Serialize {points:[{x,y,z,rx,ry,rz}], meta:{}}. Pose from toRot() verbatim (no zeroing).
nlohmann::json serializeFilterResponse(const FilterResponse& resp);

// Dispatch by node_type to the corresponding nexus filter. Returns result points
// (pose fields carry through from input — filters don't touch rx/ry/rz).
// Throws std::runtime_error for unknown node_type.
FilterResponse runFilter(const FilterRequest& req);
