#pragma once
#include <nlohmann/json.hpp>
#include <vector>
#include <string>
#include "tool/CorrugatedWeldPoseGenerator.h"
#include "tool/StreamingPoseGenerator.h"
#include "NexusType.h"

struct GenerateRequest {
    std::string node_type = "pose_generate";   // pose_generate | streaming_pose_generate
    std::vector<sa::RobotPointEx> points;
    cv::Point3f initial_pose{0, 0, 0};
    cv::Point3f initial_tangent{0, 0, 0};
    mws::CorrugatedWeldPoseGenerator::Params params;   // pose_generate 用
    mws::StreamingParams streaming_params;             // streaming_pose_generate 用
};

struct GenerateResponse {
    std::vector<sa::RobotPointEx> result;
};

// Parse JSON request into C++ structs. Returns false on malformed input.
// JSON shape: {node_type, points:[{x,y,z}], initial_pose:{rx,ry,rz}, params:{...}}
// output_mode is int (0=FULL,1=KEYPOINTS). Missing params fields use library defaults.
bool parseGenerateRequest(const nlohmann::json& j, GenerateRequest& out);

// Serialize result to JSON: {result:[{x,y,z,rx,ry,rz}], point_count:N}
nlohmann::json serializeGenerateResponse(const GenerateResponse& resp);

// The ONLY call site of the production library. Dispatches by req.node_type.
GenerateResponse runGenerate(const GenerateRequest& req);
