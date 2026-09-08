#include "filter_adapter.h"
#include <algorithm>
using std::max;
#include "filter/MWS_DistanceFilter.h"
#include "filter/MWS_AngleFilter.h"
#include "filter/MWS_MeanSmoothingFilter.h"
#include "filter/MWS_GaussianSmoothingFilter.h"
#include "filter/MWS_SavitzkyGolayFilter.h"
#include "filter/MWS_StatisticalOutlierFilter.h"
#include "filter/MWS_RansacLineFilter.h"
#include "filter/MWS_BSplineFilter.h"
#include "filter/MWS_CascadeRbtPathFilter.h"
#include "tool/PathSegmentor.h"
#include "tool/CorrugatedWeldPoseGenerator.h"
#include "core/MWS_Function.h"
#include <stdexcept>

bool parseFilterRequest(const nlohmann::json& j, FilterRequest& out) {
    try {
        out.node_type = j.value("node_type", "");
        out.points.clear();
        for (auto& pj : j.at("input").at("points")) {
            sa::RobotPointEx pt(
                static_cast<float>(pj.value("x", 0.0)),
                static_cast<float>(pj.value("y", 0.0)),
                static_cast<float>(pj.value("z", 0.0))
            );
            // 姿态字段原样读入(若存在),filter 不碰但 adapter 透传
            if (pj.contains("rx")) pt.setRot(cv::Point3f(
                static_cast<float>(pj.value("rx", 0.0)),
                static_cast<float>(pj.value("ry", 0.0)),
                static_cast<float>(pj.value("rz", 0.0))));
            out.points.push_back(pt);
        }
        out.params.clear();
        if (j.contains("params")) {
            for (auto it = j["params"].begin(); it != j["params"].end(); ++it) {
                if (it.value().is_number()) out.params[it.key()] = it.value().get<double>();
            }
        }
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

nlohmann::json serializeFilterResponse(const FilterResponse& resp) {
    nlohmann::json arr = nlohmann::json::array();
    for (const auto& pt : resp.result) {
        cv::Point3f pos = pt.toPos();
        cv::Point3f rot = pt.toRot();
        arr.push_back({
            {"x", pos.x}, {"y", pos.y}, {"z", pos.z},
            {"rx", rot.x}, {"ry", rot.y}, {"rz", rot.z},
        });
    }
    return {{"points", arr}, {"meta", resp.meta}};
}

// ---- 前端 node_type -> 库 filter 实例(参数默认值照搬库构造; toJson/analysisJson 走库实现) ----
std::shared_ptr<mws::MWSFilterInterface<sa::PointList>> makeFilter(
    const std::string& node_type, const std::map<std::string, double>& p) {

    auto opt = [&p](const char* k, double d) { return p.count(k) ? p.at(k) : d; };

    if (node_type == "filter_distance") {
        return std::make_shared<mws::DistanceFilter>(
            static_cast<float>(opt("min_th", 1.0)),
            static_cast<float>(opt("max_th", 30.0)));
    }
    if (node_type == "filter_angle") {
        return std::make_shared<mws::AngleFilter>(
            static_cast<float>(opt("angleThreshold", 30.0)),
            static_cast<int>(opt("directionWindowSize", 5)));
    }
    if (node_type == "filter_mean") {
        return std::make_shared<mws::MeanSmoothingFilter>(static_cast<float>(opt("radius", 5.0)));
    }
    if (node_type == "filter_gaussian") {
        return std::make_shared<mws::GaussianSmoothingFilter>(
            opt("sigma", 1.0), static_cast<int>(opt("kernelSize", 9)));
    }
    if (node_type == "filter_savgol") {
        return std::make_shared<mws::SavitzkyGolayFilter>(
            static_cast<int>(opt("halfWindow", 5)),
            static_cast<int>(opt("degree", 3)));
    }
    if (node_type == "filter_stat_outlier") {
        return std::make_shared<mws::StatisticalOutlierFilter>(
            opt("threshold", 0.5), static_cast<int>(opt("k", 5)));
    }
    if (node_type == "filter_ransac_line") {
        return std::make_shared<mws::RansacLineFilter>(
            static_cast<float>(opt("inlierThreshold", 1.0)),
            static_cast<int>(opt("maxIterations", 100)),
            static_cast<float>(opt("minInlierRatio", 0.7)),
            opt("enableProjection", 0.0) != 0.0);
    }
    if (node_type == "filter_bspline") {
        // uniform=true 弧长均匀重采样;false 逐点投影(保留姿态/外部轴)。
        return std::make_shared<mws::BSplineFilter>(
            opt("uniform", 1.0) != 0.0,
            static_cast<float>(opt("step", 1.0)),
            static_cast<float>(opt("Tol3D", 3.0)),
            static_cast<int>(opt("degMin", 3)),
            static_cast<int>(opt("continuity", 1)));
    }
    // filter_path_segmentor 等分析器不进库级联链
    return nullptr;
}

FilterResponse runFilter(const FilterRequest& req) {
    FilterResponse resp;
    if (req.node_type == "filter_path_segmentor") {
        // PathSegmentor(分析器):输入仅位置,点序列原样透传,分段结果进 meta。
        // output_segment: -1=全路径;0..段数-1=仅输出该段(闭区间 [start,end])。
        mws::PathSegmentor::Params sp;
        sp.curvature_threshold = req.params.count("curvature_threshold") ? req.params.at("curvature_threshold") : 0.07;
        sp.smooth_half_width = static_cast<int>(req.params.count("smooth_half_width") ? req.params.at("smooth_half_width") : 2);
        sp.tangent_smooth_window = static_cast<int>(req.params.count("tangent_smooth_window") ? req.params.at("tangent_smooth_window") : 5);
        sp.min_corner_region_length = static_cast<int>(req.params.count("min_corner_region_length") ? req.params.at("min_corner_region_length") : 2);
        sp.straight_curvature_threshold = req.params.count("straight_curvature_threshold") ? req.params.at("straight_curvature_threshold") : 0.01;
        sp.curve_ratio_threshold = req.params.count("curve_ratio_threshold") ? req.params.at("curve_ratio_threshold") : 0.05;
        mws::PathSegmentor seg;
        seg.setParams(sp);
        std::vector<cv::Point3f> positions;
        positions.reserve(req.points.size());
        for (const auto& pt : req.points) positions.push_back(pt.toPos());
        mws::PathSegmentor::Result r = seg.segment(positions);

        nlohmann::json segs = nlohmann::json::array();
        for (const auto& s : r.segments) {
            segs.push_back({
                {"start", s.start}, {"end", s.end},
                {"type", s.type == mws::PathSegmentor::Type::CURVE ? "curve" : "line"},
            });
        }
        resp.meta = {
            {"segments", segs},
            {"is_closed", r.is_closed},
            {"transition_ratio", r.transition_ratio},
        };

        int sel = static_cast<int>(req.params.count("output_segment") ? req.params.at("output_segment") : -1);
        if (sel >= 0 && sel < static_cast<int>(r.segments.size())) {
            const auto& s = r.segments[sel];
            sa::PointList out;
            for (int i = s.start; i <= s.end && i < static_cast<int>(req.points.size()); ++i) {
                out.push_back(req.points[i]);
            }
            resp.result = std::move(out);
        } else {
            resp.result = req.points;  // 全路径透传(姿态搭便车)
        }
        return resp;
    }

    auto f = makeFilter(req.node_type, req.params);
    if (!f) throw std::runtime_error("unknown filter node_type: " + req.node_type);
    resp.result = f->apply(req.points);
    return resp;
}

// ---- 节点链 <-> MWS_PathFilterAndPoseGenerator 序列化(直接用库 toJson/analysisJson) ----

// pose Params:嵌套结构的 toJson/fromJson 未被 lib 导出(级联链部分不受影响),
// 这里按库实现逐字段对齐(见 CorrugatedWeldPoseGenerator.cpp Params::fromJson)——
// 8 个字段全为 number,无 bool 类型风险。
static mws::CorrugatedWeldPoseGenerator::Params poseParamsFromJson(const nlohmann::json& j) {
    mws::CorrugatedWeldPoseGenerator::Params p;
    if (j.is_object()) {
        p.curvature_threshold = j.value("curvature_threshold", 0.07);
        p.smooth_half_width = j.value("smooth_half_width", 2);
        p.tangent_smooth_window = j.value("tangent_smooth_window", 5);
        p.min_corner_region_length = j.value("min_corner_region_length", 2);
        p.output_mode = static_cast<mws::CorrugatedWeldPoseGenerator::Params::OutputMode>(j.value("output_mode", 0));
        p.max_pose_change_angle = j.value("max_pose_change_angle", 45.0);
        p.all_curve_threshold = j.value("all_curve_threshold", 0.8);
        p.keypoint_pose_angle_threshold = j.value("keypoint_pose_angle_threshold", 5.0);
    }
    return p;
}

static nlohmann::json poseParamsToJson(const mws::CorrugatedWeldPoseGenerator::Params& p) {
    return {
        {"curvature_threshold", p.curvature_threshold},
        {"smooth_half_width", p.smooth_half_width},
        {"tangent_smooth_window", p.tangent_smooth_window},
        {"min_corner_region_length", p.min_corner_region_length},
        {"output_mode", static_cast<int>(p.output_mode)},
        {"max_pose_change_angle", p.max_pose_change_angle},
        {"all_curve_threshold", p.all_curve_threshold},
        {"keypoint_pose_angle_threshold", p.keypoint_pose_angle_threshold},
    };
}

nlohmann::json runPipelineSerialize(const nlohmann::json& body) {
    mws::CascadeRbtPathFilter cascade;
    if (body.contains("nodes") && body["nodes"].is_array()) {
        for (const auto& nj : body["nodes"]) {
            std::map<std::string, double> p;
            if (nj.contains("params") && nj["params"].is_object()) {
                for (auto it = nj["params"].begin(); it != nj["params"].end(); ++it) {
                    if (it.value().is_number()) p[it.key()] = it.value().get<double>();
                }
            }
            auto f = makeFilter(nj.value("type", ""), p);
            if (f) cascade.addFilter(f);
        }
    }
    mws::CorrugatedWeldPoseGenerator::Params pose = poseParamsFromJson(body.value("pose", nlohmann::json::object()));

    nlohmann::json out;   // Json = nlohmann::json,库 toJson 产物直接落
    out["pipeline"] = cascade.toJson();
    out["pose"] = poseParamsToJson(pose);
    return out;
}

nlohmann::json runPipelineDeserialize(const nlohmann::json& body) {
    // analysisJson 按库规则重建链(未知 filter 跳过、字段严格按库类型),
    // 再 toJson 权威回显——前端拿到的即生产格式。
    Json j = body;   // analysisJson 收非 const 左参,拷一份供其原位读
    mws::CascadeRbtPathFilter cascade;
    if (j.contains("pipeline")) cascade.analysisJson(j["pipeline"]);  // 库容器同款:喂 pipeline 子对象
    mws::CorrugatedWeldPoseGenerator::Params pose = poseParamsFromJson(j.contains("pose") ? j["pose"] : nlohmann::json::object());

    nlohmann::json out;
    out["filters"] = cascade.toJson()["filters"];
    out["pose"] = poseParamsToJson(pose);
    return out;
}
