#include "pose_adapter.h"
#include <stdexcept>

bool parseGenerateRequest(const nlohmann::json& j, GenerateRequest& out) {
    try {
        out.points.clear();
        for (auto& pj : j.at("points")) {
            sa::RobotPointEx pt(
                static_cast<float>(pj.value("x", 0.0)),
                static_cast<float>(pj.value("y", 0.0)),
                static_cast<float>(pj.value("z", 0.0))
            );
            out.points.push_back(pt);
        }
        const auto& ip = j.at("initial_pose");
        out.initial_pose = cv::Point3f(
            static_cast<float>(ip.value("rx", 0.0)),
            static_cast<float>(ip.value("ry", 0.0)),
            static_cast<float>(ip.value("rz", 0.0))
        );
        // 初始切线(可选):(0,0,0)=起点切线方向=初始姿态切线方向,不做对齐旋转
        if (j.contains("initial_tangent")) {
            const auto& it = j.at("initial_tangent");
            out.initial_tangent = cv::Point3f(
                static_cast<float>(it.value("tx", 0.0)),
                static_cast<float>(it.value("ty", 0.0)),
                static_cast<float>(it.value("tz", 0.0))
            );
        }
        // Build Params field-by-field using the same defaults and int-cast the
        // library's fromJson uses, to stay consistent with library semantics
        // without coupling to nexus's internal Json type.
        mws::CorrugatedWeldPoseGenerator::Params p;
        const auto& pj = j.value("params", nlohmann::json::object());
        p.curvature_threshold = pj.value("curvature_threshold", 0.07);
        p.smooth_half_width = pj.value("smooth_half_width", 2);
        p.tangent_smooth_window = pj.value("tangent_smooth_window", 5);
        p.min_corner_region_length = pj.value("min_corner_region_length", 2);
        p.output_mode = static_cast<mws::CorrugatedWeldPoseGenerator::Params::OutputMode>(
            pj.value("output_mode", 0));
        p.max_pose_change_angle = pj.value("max_pose_change_angle", 45.0);
        p.all_curve_threshold = pj.value("all_curve_threshold", 0.8);
        p.keypoint_pose_angle_threshold = pj.value("keypoint_pose_angle_threshold", 5.0);
        out.params = p;
        return true;
    } catch (const std::exception&) {
        return false;
    }
}

nlohmann::json serializeGenerateResponse(const GenerateResponse& resp) {
    nlohmann::json arr = nlohmann::json::array();
    for (const auto& pt : resp.result) {
        cv::Point3f pos = pt.toPos();
        cv::Point3f rot = pt.toRot();
        arr.push_back({
            {"x", pos.x}, {"y", pos.y}, {"z", pos.z},
            {"rx", rot.x}, {"ry", rot.y}, {"rz", rot.z},
        });
    }
    return {{"result", arr}, {"point_count", resp.result.size()}};
}

GenerateResponse runGenerate(const GenerateRequest& req) {
    mws::CorrugatedWeldPoseGenerator generator;
    generator.setParams(req.params);
    GenerateResponse resp;
    resp.result = generator.generate(req.points, req.initial_pose, req.initial_tangent);
    return resp;
}
