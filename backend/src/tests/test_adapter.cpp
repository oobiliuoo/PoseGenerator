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

    std::cout << "test_adapter OK\n";
    return 0;
}
