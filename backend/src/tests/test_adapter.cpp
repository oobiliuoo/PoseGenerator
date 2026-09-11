#include <cassert>
#include <iostream>
#include <cmath>
#include "../pose_adapter.h"

// Behavior-consistency: adapter must equal direct library call.
int main() {
    std::vector<sa::RobotPointEx> pts;
    for (int i = 0; i < 20; ++i) pts.emplace_back(i * 10.0f, 0.0f, 0.0f);

    GenerateRequest req;
    req.points = pts;
    req.initial_pose = cv::Point3f(0.0f, 45.0f, 178.0f);
    // params left as defaults

    mws::CorrugatedWeldPoseGenerator ref;
    ref.setParams(req.params);
    auto ref_result = ref.generate(req.points, req.initial_pose);

    auto resp = runGenerate(req);

    assert(resp.result.size() == ref_result.size());
    for (size_t i = 0; i < resp.result.size(); ++i) {
        cv::Point3f a = resp.result[i].toRot();
        cv::Point3f b = ref_result[i].toRot();
        assert(std::abs(a.x - b.x) < 1e-4f);
        assert(std::abs(a.y - b.y) < 1e-4f);
        assert(std::abs(a.z - b.z) < 1e-4f);
    }

    nlohmann::json j;
    j["points"] = nlohmann::json::array();
    for (auto& p : pts) j["points"].push_back({{"x", p.x}, {"y", p.y}, {"z", p.z}});
    j["initial_pose"] = {{"rx", 0.0}, {"ry", 45.0}, {"rz", 178.0}};
    j["params"] = {{"output_mode", 0}};
    GenerateRequest parsed;
    assert(parseGenerateRequest(j, parsed));
    assert(parsed.points.size() == 20);
    assert(parsed.initial_pose.y == 45.0f);

    // 流式姿态生成:与库直接调用逐点一致(适配器只做 initialize→appendPoints→finalize→popOutputs)
    {
        GenerateRequest sreq;
        sreq.node_type = "streaming_pose_generate";
        sreq.points = pts;
        sreq.initial_pose = cv::Point3f(0.0f, 45.0f, 178.0f);
        sreq.initial_tangent = cv::Point3f(0.0f, 0.0f, 1.0f);   // 显式切线:触发起始姿态对齐
        sreq.streaming_params.tangent_smooth_window = 5;
        sreq.streaming_params.max_pose_change_angle = 45.0;
        sreq.streaming_params.enable_unwrap = true;

        mws::StreamingPoseGenerator ref_gen;
        ref_gen.initialize(sreq.initial_pose, sreq.streaming_params, sreq.initial_tangent);
        ref_gen.appendPoints(sreq.points);
        ref_gen.finalize();
        auto ref_stream = ref_gen.popOutputs();

        auto sresp = runGenerate(sreq);
        assert(sresp.result.size() == ref_stream.size());
        assert(sresp.result.size() == pts.size());   // 全部点都有输出
        for (size_t i = 0; i < sresp.result.size(); ++i) {
            cv::Point3f a = sresp.result[i].toRot();
            cv::Point3f b = ref_stream[i].toRot();
            assert(std::abs(a.x - b.x) < 1e-4f);
            assert(std::abs(a.y - b.y) < 1e-4f);
            assert(std::abs(a.z - b.z) < 1e-4f);
        }
        std::cout << "streaming_pose_generate: " << sresp.result.size() << " pts (in "
                  << pts.size() << ")\n";

        // enable_unwrap 用 0/1 number 传入也必须解析成功(前端 params 为 Record<string, number>)
        nlohmann::json sj;
        sj["node_type"] = "streaming_pose_generate";
        sj["points"] = nlohmann::json::array();
        for (auto& p : pts) sj["points"].push_back({{"x", p.x}, {"y", p.y}, {"z", p.z}});
        sj["initial_pose"] = {{"rx", 0.0}, {"ry", 45.0}, {"rz", 178.0}};
        sj["initial_tangent"] = {{"tx", 0.0}, {"ty", 0.0}, {"tz", 1.0}};
        sj["params"] = {{"tangent_smooth_window", 3}, {"max_pose_change_angle", 30.0}, {"enable_unwrap", 0}};
        GenerateRequest sparsed;
        assert(parseGenerateRequest(sj, sparsed));
        assert(sparsed.node_type == "streaming_pose_generate");
        assert(sparsed.streaming_params.tangent_smooth_window == 3);
        assert(sparsed.streaming_params.enable_unwrap == false);
        assert(sparsed.initial_tangent.z == 1.0f);
    }

    std::cout << "test_adapter OK\n";
    return 0;
}
