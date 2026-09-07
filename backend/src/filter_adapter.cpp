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
#include "tool/PathSegmentor.h"
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

FilterResponse runFilter(const FilterRequest& req) {
    FilterResponse resp;
    const auto& p = req.params;
    if (req.node_type == "filter_distance") {
        float min_th = static_cast<float>(p.count("min_th") ? p.at("min_th") : 1.0);
        float max_th = static_cast<float>(p.count("max_th") ? p.at("max_th") : 30.0);
        mws::DistanceFilter f(min_th, max_th);
        resp.result = f.apply(req.points);
        return resp;
    }
    if (req.node_type == "filter_angle") {
        float angleThreshold = static_cast<float>(p.count("angleThreshold") ? p.at("angleThreshold") : 30.0);
        int dirWin = static_cast<int>(p.count("directionWindowSize") ? p.at("directionWindowSize") : 5);
        mws::AngleFilter f(angleThreshold, dirWin);
        resp.result = f.apply(req.points);
        return resp;
    }
    if (req.node_type == "filter_mean") {
        float radius = static_cast<float>(p.count("radius") ? p.at("radius") : 5.0);
        mws::MeanSmoothingFilter f(radius);
        resp.result = f.apply(req.points);
        return resp;
    }
    if (req.node_type == "filter_gaussian") {
        double sigma = p.count("sigma") ? p.at("sigma") : 1.0;
        int kernelSize = static_cast<int>(p.count("kernelSize") ? p.at("kernelSize") : 9);
        mws::GaussianSmoothingFilter f(sigma, kernelSize);
        resp.result = f.apply(req.points);
        return resp;
    }
    if (req.node_type == "filter_savgol") {
        int halfWindow = static_cast<int>(p.count("halfWindow") ? p.at("halfWindow") : 5);
        int degree = static_cast<int>(p.count("degree") ? p.at("degree") : 3);
        mws::SavitzkyGolayFilter f(halfWindow, degree);
        resp.result = f.apply(req.points);
        return resp;
    }
    if (req.node_type == "filter_stat_outlier") {
        double threshold = p.count("threshold") ? p.at("threshold") : 0.5;
        int k = static_cast<int>(p.count("k") ? p.at("k") : 5);
        mws::StatisticalOutlierFilter f(threshold, k);
        resp.result = f.apply(req.points);
        return resp;
    }
    if (req.node_type == "filter_ransac_line") {
        float inlierTh = static_cast<float>(p.count("inlierThreshold") ? p.at("inlierThreshold") : 1.0);
        int maxIter = static_cast<int>(p.count("maxIterations") ? p.at("maxIterations") : 100);
        float minRatio = static_cast<float>(p.count("minInlierRatio") ? p.at("minInlierRatio") : 0.7);
        bool enableProj = p.count("enableProjection") ? (p.at("enableProjection") != 0) : false;
        mws::RansacLineFilter f(inlierTh, maxIter, minRatio, enableProj);
        resp.result = f.apply(req.points);
        return resp;
    }
    if (req.node_type == "filter_bspline") {
        // BSplineFilter(filter 子类):B 样条拟合重建。
        // uniform=true 弧长均匀重采样(输出≈长/step);false 逐点投影(输出=输入,保留姿态/外部轴)。
        // 库内失败/点数<3 原样透传(adapter 不再抛错,与库行为一致)。
        bool uniform = p.count("uniform") ? (p.at("uniform") != 0) : true;
        float step = static_cast<float>(p.count("step") ? p.at("step") : 1.0);
        float tol3d = static_cast<float>(p.count("Tol3D") ? p.at("Tol3D") : 3.0);
        int degMin = static_cast<int>(p.count("degMin") ? p.at("degMin") : 3);
        int cont = static_cast<int>(p.count("continuity") ? p.at("continuity") : 1);
        mws::BSplineFilter f(uniform, step, tol3d, degMin, cont);
        resp.result = f.apply(req.points);
        return resp;
    }
    if (req.node_type == "filter_path_segmentor") {
        // PathSegmentor(分析器):输入仅位置,点序列原样透传,分段结果进 meta。
        // output_segment: -1=全路径;0..段数-1=仅输出该段(闭区间 [start,end])。
        mws::PathSegmentor::Params sp;
        sp.curvature_threshold = p.count("curvature_threshold") ? p.at("curvature_threshold") : 0.07;
        sp.smooth_half_width = static_cast<int>(p.count("smooth_half_width") ? p.at("smooth_half_width") : 2);
        sp.tangent_smooth_window = static_cast<int>(p.count("tangent_smooth_window") ? p.at("tangent_smooth_window") : 5);
        sp.min_corner_region_length = static_cast<int>(p.count("min_corner_region_length") ? p.at("min_corner_region_length") : 2);
        sp.straight_curvature_threshold = p.count("straight_curvature_threshold") ? p.at("straight_curvature_threshold") : 0.01;
        sp.curve_ratio_threshold = p.count("curve_ratio_threshold") ? p.at("curve_ratio_threshold") : 0.05;
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

        int sel = static_cast<int>(p.count("output_segment") ? p.at("output_segment") : -1);
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
    throw std::runtime_error("unknown filter node_type: " + req.node_type);
}
