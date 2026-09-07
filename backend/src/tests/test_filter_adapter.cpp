#include <cassert>
#include <iostream>
#include "../filter_adapter.h"

int main() {
    // 构造 20 点直线,点距 10,设 min_th=5 max_th=15 应全部保留
    std::vector<sa::RobotPointEx> pts;
    for (int i = 0; i < 20; ++i) pts.emplace_back(i * 10.0f, 0.0f, 0.0f);

    FilterRequest req;
    req.node_type = "filter_distance";
    req.points = pts;
    req.params["min_th"] = 5.0;
    req.params["max_th"] = 15.0;
    auto resp = runFilter(req);
    assert(resp.result.size() == 20);  // 点距 10 在 [5,15] 内,全保留
    std::cout << "filter_distance: " << resp.result.size() << " pts (expect 20)\n";

    // 未知 node_type 应抛
    req.node_type = "filter_unknown";
    bool threw = false;
    try { runFilter(req); } catch (...) { threw = true; }
    assert(threw);

    // JSON round-trip
    nlohmann::json j;
    j["node_type"] = "filter_distance";
    j["input"] = {{"points", nlohmann::json::array()}};
    for (auto& pt : pts) j["input"]["points"].push_back({{"x", pt.x}, {"y", pt.y}, {"z", pt.z}});
    j["params"] = {{"min_th", 5.0}, {"max_th", 15.0}};
    FilterRequest parsed;
    assert(parseFilterRequest(j, parsed));
    assert(parsed.points.size() == 20);
    assert(parsed.params.at("min_th") == 5.0);

    // 各 filter 烟雾测试:不崩 + 返回点数 >= 1
    auto runSmoke = [&](const std::string& node_type, std::map<std::string, double> params) {
        FilterRequest r; r.node_type = node_type; r.points = pts; r.params = params;
        auto out = runFilter(r);
        assert(out.result.size() >= 1);
        std::cout << node_type << ": " << out.result.size() << " pts (in 20)\n";
    };
    runSmoke("filter_angle", {{"angleThreshold", 30.0}, {"directionWindowSize", 5}});
    runSmoke("filter_mean", {{"radius", 5.0}});
    runSmoke("filter_gaussian", {{"sigma", 1.0}, {"kernelSize", 9}});
    runSmoke("filter_savgol", {{"halfWindow", 5}, {"degree", 3}});
    runSmoke("filter_stat_outlier", {{"threshold", 0.5}, {"k", 5}});
    runSmoke("filter_ransac_line", {{"inlierThreshold", 1.0}, {"maxIterations", 100}, {"minInlierRatio", 0.7}, {"enableProjection", 0}});

    // B 样条均匀重建:自由函数,返回码非0抛错,成功应 >=2 点(直线 190mm / step5 → 多点)
    {
        FilterRequest r; r.node_type = "filter_bspline"; r.points = pts;
        r.params["step"] = 5.0; r.params["Tol3D"] = 3.0; r.params["degMin"] = 3; r.params["continuity"] = 2;
        auto out = runFilter(r);
        assert(out.result.size() >= 2);
        std::cout << "filter_bspline: " << out.result.size() << " pts (in 20)\n";
    }

    // 路径分段:折线(直线段+角点+直线段)应产生 >=2 段;段选 0 只输出第 0 段;
    // 全路径(-1)透传点数不变;meta 带 segments。
    {
        std::vector<sa::RobotPointEx> fold;
        for (int i = 0; i <= 10; ++i) fold.emplace_back(i * 10.0f, 0.0f, 0.0f);       // x 轴直线
        for (int i = 1; i <= 10; ++i) fold.emplace_back(100.0f, i * 10.0f, 0.0f);     // 90° 转向 y 轴
        FilterRequest r; r.node_type = "filter_path_segmentor"; r.points = fold;
        r.params["output_segment"] = -1.0;
        auto all = runFilter(r);
        assert(all.result.size() == fold.size());          // 全路径透传
        int nseg = static_cast<int>(all.meta["segments"].size());
        assert(nseg >= 2);                                  // 直线+直线 至少 2 段
        std::cout << "filter_path_segmentor: " << nseg << " segments, passthrough " << all.result.size() << " pts\n";

        r.params["output_segment"] = 0.0;
        auto seg0 = runFilter(r);
        const auto& s0 = all.meta["segments"][0];
        assert(seg0.result.size() == static_cast<size_t>(s0["end"].get<int>() - s0["start"].get<int>() + 1));
        std::cout << "filter_path_segmentor: seg0 " << seg0.result.size() << " pts\n";
    }

    std::cout << "test_filter_adapter OK\n";
    return 0;
}
