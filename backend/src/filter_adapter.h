#pragma once
#include <nlohmann/json.hpp>
#include <vector>
#include <string>
#include <map>
#include <memory>
#include "NexusType.h"
#include "filter/MWS_FilterInterface.h"

struct FilterRequest {
    std::string node_type;
    std::vector<sa::RobotPointEx> points;
    std::map<std::string, double> params;
};

struct FilterResponse {
    std::vector<sa::RobotPointEx> result;
    // 分析类节点的附加结果(如 path_segmentor 的分段表);普通 filter 为空对象。
    nlohmann::json meta = nlohmann::json::object();
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

// 前端 node_type + 前端 params -> 库 filter 实例(参数默认值照搬库构造)。
// filter_path_segmentor 等非库链节点返回 nullptr。未知 node_type 也返回 nullptr。
std::shared_ptr<mws::MWSFilterInterface<sa::PointList>> makeFilter(
    const std::string& node_type, const std::map<std::string, double>& p);

// 节点链 -> MWS_PathFilterAndPoseGenerator 序列化(库 toJson,格式与生产完全一致)。
// body: {nodes:[{type, params}], pose:{8参数}} -> {"pipeline":CascadeRbtPathFilter::toJson(), "pose":Params::toJson()}
nlohmann::json runPipelineSerialize(const nlohmann::json& body);

// MWS 序列化 -> 库解析后权威回显(analysisJson 重建链,未知 filter 跳过)。
// body: 库 JSON -> {"filters":[{name,config}], "pose":Params::toJson()}
nlohmann::json runPipelineDeserialize(const nlohmann::json& body);
