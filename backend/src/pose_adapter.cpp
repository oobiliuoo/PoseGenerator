#include "pose_adapter.h"
#include <stdexcept>

bool parseGenerateRequest(const nlohmann::json& j, GenerateRequest& out) {
    try {
        out.node_type = j.value("node_type", "pose_generate");
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

        // 流式参数(仅 streaming_pose_generate 用;缺省照搬库 StreamingParams 默认值)
        // enable_unwrap 前端传 0/1,不能用 value(key, true)——number 对 bool 默认值会抛 type_error
        mws::StreamingParams sp;
        sp.tangent_smooth_window = pj.value("tangent_smooth_window", 15);
        sp.max_pose_change_angle = pj.value("max_pose_change_angle", 15.0);
        sp.enable_unwrap = pj.count("enable_unwrap") ? (pj.at("enable_unwrap").get<double>() != 0) : true;
        out.streaming_params = sp;
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
    GenerateResponse resp;
    if (req.node_type == "streaming_pose_generate") {
        // 流式生成器离线训化:一批喂完即 finalize,再取全部输出。
        // 语义等价批量的全曲线模式(库文档:开放路径下逐点一致)。
        mws::StreamingPoseGenerator gen;
        gen.initialize(req.initial_pose, req.streaming_params, req.initial_tangent);
        gen.appendPoints(req.points);
        gen.finalize();
        resp.result = gen.popOutputs();
        return resp;
    }
    mws::CorrugatedWeldPoseGenerator generator;
    generator.setParams(req.params);
    resp.result = generator.generate(req.points, req.initial_pose, req.initial_tangent);
    return resp;
}
