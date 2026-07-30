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
    return {{"points", arr}, {"meta", nlohmann::json::object()}};
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
    throw std::runtime_error("unknown filter node_type: " + req.node_type);
}
