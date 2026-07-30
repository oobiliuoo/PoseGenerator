#include "filter_adapter.h"
#include "filter/MWS_DistanceFilter.h"
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
    throw std::runtime_error("unknown filter node_type: " + req.node_type);
}
