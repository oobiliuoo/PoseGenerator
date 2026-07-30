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

    std::cout << "test_filter_adapter OK\n";
    return 0;
}
